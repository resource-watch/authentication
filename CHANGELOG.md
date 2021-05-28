## 28/05/2021

- Fix issue that caused DELETE `/auth/user/:userId` to deactivate users instead of deleting them.

## 21/05/2021

- Add support for hosts from `referer` header when generating pagination links.

# 1.4.3

## 26/04/2021

- Fix social login with token for users who don't have an email (no email from Google, Facebook or Apple).
- Fix issue with user apps not being taken into account on sign-up.
- Remove revoked token exception if token is older than less than 1h.

# 1.4.2

## 23/04/2021

- Fix social login with token for users who weren't being correctly matched with Okta users.

# 1.4.1

## 15/04/2021

- Update `origin` in Okta after password reset process.
- Fix issues with special characters when requesting a sign-up redirect.

# 1.4.0

## 12/04/2021

- Store `callbackUrl` provided in query/request body on sign up as `origin` in Okta to be used in redirect after sign in.

# 1.3.0

## 08/04/2021

- Unify social login accounts for Google and Facebook.
- Add Redis cache support to reduce number of requests made to Okta on token validation.

# 1.2.1

## 31/03/2021

- Fix issues with pagination.

# 1.2.0

## 30/03/2021

- Remove references to first and last name across Okta code.

# 1.1.1

## 30/03/2021

- Fix issue in pagination links returned from the GET users response.

# 1.1.0

## 26/03/2021

- Add `sign-up-redirect` endpoint to redirect users to referrer of sign up call (stored in user).
- Fix issue where some users were still being created with display name "RW API USER".

## 25/03/2021

- Add call to Okta delete session endpoint on logout.

## 09/02/2021

- Prefer `authorization` header over `authentication`.
- `authentication` header support deprecated

## 25/01/2021

- Add redirection to `config.publicUrl` to account for `passport-twitter` only supporting a single source host. 

## 18/01/2021

- Streamline response structure for user management endpoints.

## 11/12/2020

- Serialize user in `/apple/token` endpoint to avoid mongoose data leakage.

# v1.0.0

## 29/10/2020

- Initial commit from Control Tower's code.
