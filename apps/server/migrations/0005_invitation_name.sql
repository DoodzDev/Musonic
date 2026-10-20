-- The name of the account an invitation created, kept when that account is deleted (the
-- invitation then reads "used by Test, account deleted" instead of looking unused).
ALTER TABLE invitation ADD COLUMN used_by_name TEXT;
UPDATE invitation SET used_by_name = (SELECT username FROM user WHERE user.id = invitation.used_by)
 WHERE used_by IS NOT NULL;
