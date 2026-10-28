# 0008: Resolve push recipients at send time and prune dead tokens

Date: 2026-10-29

## Context

Push goes through Expo Push and FCM. Dedupe keys and `notification_log` uniqueness prevent duplicate sends, but they do not decide who should receive an alert. Users unfollow, sign out and uninstall.

## Decision

- The recipient list is read at send time, not at the start of the poll, so an unfollow or removed favorite takes effect within one poll.
- A push token is deleted when Expo reports `DeviceNotRegistered`.
- Signing out deletes that device's token on the server.
- Alerts go to every registered device on an account.

## Consequences

- The poller does a recipient query per alert, which is cheap at 5 to 10 users.
- A user with two devices gets two notifications for each event.
