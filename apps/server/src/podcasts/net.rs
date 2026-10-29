//! Addresses the server may fetch for podcasts. Feeds and their audio come from anyone who
//! follows a show: without this check, a feed pointing at `http://127.0.0.1:…` or at another
//! container would make the server read what only it can reach.

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

use anyhow::{Result, bail};

/// True for addresses on the public internet.
pub fn is_public(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => is_public_v4(v4),
        IpAddr::V6(v6) => match v6.to_ipv4_mapped() {
            Some(v4) => is_public_v4(v4),
            None => is_public_v6(v6),
        },
    }
}

fn is_public_v4(ip: Ipv4Addr) -> bool {
    let [a, b, ..] = ip.octets();
    !(ip.is_private()
        || ip.is_loopback()
        || ip.is_link_local()
        || ip.is_unspecified()
        || ip.is_broadcast()
        || ip.is_documentation()
        || ip.is_multicast()
        || a == 0
        || (a == 100 && (64..128).contains(&b)) // shared address space (CGNAT)
        || (a == 198 && (b == 18 || b == 19)) // benchmarking
        || a >= 240)
}

fn is_public_v6(ip: Ipv6Addr) -> bool {
    let first = ip.segments()[0];
    !(ip.is_loopback()
        || ip.is_unspecified()
        || ip.is_multicast()
        || (first & 0xfe00) == 0xfc00 // unique local
        || (first & 0xffc0) == 0xfe80) // link local
}

/// Checks that `url` is http(s) and that every address its host resolves to is public.
pub async fn check(url: &reqwest::Url) -> Result<()> {
    if !matches!(url.scheme(), "http" | "https") {
        bail!("only http(s) addresses");
    }
    let host = url.host_str().unwrap_or_default();
    let port = url.port_or_known_default().unwrap_or(80);
    let addrs: Vec<_> = tokio::net::lookup_host((host.trim_matches(['[', ']']), port))
        .await?
        .collect();
    if addrs.is_empty() || addrs.iter().any(|a| !is_public(a.ip())) {
        bail!("address not on the public internet");
    }
    Ok(())
}

/// Redirects to `localhost` or to a literal private address are refused. A redirect to a host
/// name is not resolved here (the policy cannot wait): hosts serving feeds and audio redirect
/// to their CDN by name, and a name pointing inside would need a hostile public host first.
pub fn redirect_policy() -> reqwest::redirect::Policy {
    reqwest::redirect::Policy::custom(|attempt| {
        if attempt.previous().len() >= 10 {
            return attempt.error("too many redirects");
        }
        let url = attempt.url();
        let host = url.host_str().unwrap_or_default().trim_matches(['[', ']']);
        let refused = !matches!(url.scheme(), "http" | "https")
            || host.eq_ignore_ascii_case("localhost")
            || host.parse::<IpAddr>().is_ok_and(|ip| !is_public(ip));
        if refused {
            attempt.error("redirect to a private address")
        } else {
            attempt.follow()
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn private_addresses_are_refused() {
        for ip in [
            "127.0.0.1",
            "10.0.0.149",
            "172.19.0.3",
            "192.168.1.20",
            "169.254.169.254",
            "100.64.0.1",
            "0.0.0.0",
            "::1",
            "fd00::1",
            "fe80::1",
            "::ffff:127.0.0.1",
        ] {
            assert!(!is_public(ip.parse().unwrap()), "{ip}");
        }
        for ip in ["145.241.161.65", "1.1.1.1", "2606:4700::1111"] {
            assert!(is_public(ip.parse().unwrap()), "{ip}");
        }
    }

    #[tokio::test]
    async fn local_urls_are_refused() {
        for url in [
            "http://127.0.0.1:4533/rest/ping",
            "http://localhost/",
            "file:///etc/passwd",
            "http://[::1]/",
        ] {
            assert!(
                check(&reqwest::Url::parse(url).unwrap()).await.is_err(),
                "{url}"
            );
        }
    }
}
