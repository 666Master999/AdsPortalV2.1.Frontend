# Access Guide

## Source Of Truth
- Prefer the backend-returned `roles` array from `UserProfileDto` for visibility decisions.
- Login/register/refresh responses return tokens only; decode the access token for identity, then hydrate `GET /users/{id}` for profile data.
- Use backend `401`/`403` responses as the authorization source of truth.
- `GET /notifications` is not a profile source.
- Do not invent local role names or infer access from interface labels.
- Restrictions are separate from JWT claims; load them from the existing restrictions endpoint after login/refresh.

## Backend Names
- Roles: `User`, `Moderator`, `Admin`, `SuperAdmin`.
- `User` has basic ad access.
- `Moderator` can moderate ads and ban users.
- `Admin` can view hidden ads, unban users, edit users, see logs, and manage categories.
- `SuperAdmin` has the full seed/auth access set.

## UI Rules
- Prefer roles for visibility checks.
- Do not guess access from button text, page labels, or local aliases.
- Use `accessService.can*()` in components instead of inline role checks.

## Recommended accessService API
- `hasRole(roleName)` reads `roles`.
- `hasPermission(permissionName)` is available for explicit backend permission checks only.
- `canAccessAdmin()` should rely on `Admin` or `SuperAdmin` roles.
- `canModerate()` should rely on `Moderator`, `Admin`, or `SuperAdmin` roles.

## Router And Guards
- Use `RequireRole` and `accessService.hasRole()` for role-gated screens.
- Use backend `401`/`403` for actual authorization failures.
- Route meta should stay aligned with the backend role names returned in `UserProfileDto.roles`.
- `LoginBan` should redirect to `/blocked`; `PostBan` and `ChatBan` should come from restrictions state.

## Practical Rule
- If a menu item or button should appear for admins, bind it to `canAccessAdmin()`.
- If a resource should be protected by role, bind it to a role-first guard.
- If the backend sends a new role, add it to the service and guide instead of hardcoding a local alias.
