## 11/07/2023

- Update `rw-api-microservice-node` to add API Key support.

## 29/06/2022

- Add `deletion` model and CRUD endpoints
- Create `deletion` object on user deletion

## 27/06/2022

- Update nodejs to 16.15
- Update dependencies based on yarn audit

## 10/03/2022

- Upgrade node 12 -> 16.

## 16/09/2021

- Improve error message when requesting a password reset for an email with an already existing social login account.

# 1.5.0

## 09/06/2021

- Return 200 OK in `sign-up-redirect` endpoint when `origin` redirect cannot be found.
- Add support for hosts from `x-rw-domain` header when generating pagination links.
- Update `rw-api-microservice-node` to add CORS support.
- Fix issue that caused DELETE `/auth/user/:userId` to deactivate users instead of deleting them.
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
