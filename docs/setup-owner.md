# Owner setup

Everything in this file has to be done by a person with owner rights. None of it
can be automated from inside the repository, which is why it is a checklist
rather than a script. Work top to bottom; later steps depend on earlier ones.

Nothing here should ever be committed. Where a step produces a credential, keep
it in a password manager and inject it with `op run --env-file`, never in a file.

---

## 1. Claim the npm scope `@maplekit`

The packages are published as `@maplekit/core`, `@maplekit/cli` and
`@maplekit/mcp`. The scope was unclaimed when this was written; claiming it is
what stops someone else taking it.

1. Sign in at <https://www.npmjs.com> as the account that will own the packages.
2. Go to <https://www.npmjs.com/org/create> and create the organisation
   `maplekit`. The free tier covers unlimited public packages.
3. Under the organisation's **Members**, add anyone who will publish.
4. Under **Settings**, require two-factor authentication for all members.

Verify: `npm view @maplekit/core` reports a 404 with your scope existing, and
<https://www.npmjs.com/org/maplekit> loads while you are signed in.

## 2. Configure the GitHub organisation

1. The repositories live under the `maple-kit` organisation.
2. In **Settings → Actions → General**, set workflow permissions to
   _Read repository contents and packages permissions_. The workflows here ask
   for anything more per job.
3. In **Settings → Code security**, enable:
   - **Secret scanning** and **Push protection** — this is the backstop for the
     gitleaks hook, which a contributor can skip with `--no-verify`.
   - **Dependabot alerts** and **Dependabot security updates**.
   - **Private vulnerability reporting**, so a reporter has somewhere to go that
     is not a public issue.
4. In **Settings → Member privileges**, turn off _Allow members to create public
   repositories_ until the flip to public is deliberate.

## 3. Enable Socket.dev

Socket reviews every dependency change for install scripts, obfuscated code and
sudden maintainer changes. It is the control that catches a compromised release
that a version bump alone would hide.

1. Install the GitHub app from <https://github.com/apps/socket-security> onto
   the `maple-kit` organisation.
2. Grant it access to all repositories, including future ones.
3. Confirm whether the free tier covers private repositories on your plan. If it
   does not, note it and enable Socket at the point the repositories go public;
   do not leave it half-configured.

Verify: open a pull request that adds a dependency and confirm Socket comments.

## 4. Register the GitHub App

One app serves both the comment posting in US1 and the merge gate in US2. Create
it now so the app id and key exist before the code needs them.

1. Go to **Organisation settings → Developer settings → GitHub Apps → New**.
2. Name it `Maple`. Homepage: `https://github.com/maple-kit/maple`.
3. **Uncheck Webhook → Active** for now. US2 turns it on with a real URL.
4. Under **Identifying and authorising users**:
   - Enable **Device Flow**. This is what lets a reviewer sign in from a preview
     host without a redirect URI per deployment.
   - Enable **Expire user authorisation tokens**.
   - Leave **Request user authorisation (OAuth) during installation** off.
5. Permissions — **Repository**:
   | Permission    | Access         | Why                                                    |
   | ------------- | -------------- | ------------------------------------------------------ |
   | Checks        | Read and write | The `maple/visual-review` check run is the merge gate. |
   | Pull requests | Read and write | Posting and updating the sticky comment.               |
   | Contents      | Read-only      | Reading the commit a comment was anchored against.     |
   | Metadata      | Read-only      | Mandatory.                                             |
6. **Where can this app be installed?** Any account, so other organisations can
   use the gate.
7. Create the app, then:
   - Note the **App ID** and the **Client ID**.
   - Generate a **private key** and store the `.pem` in a password manager. It
     is downloaded once and never shown again. `*.pem` is gitignored, but the
     file should not be in the working tree at all.
8. Install the app on the `maple-kit` organisation.

## 5. Branch protection

On `maple-kit/maple`, protect `main`:

- Require a pull request before merging, with one approval.
- Require status checks to pass: `lint`, `typecheck`, `test`, `gitleaks`,
  `publint`, `dco`.
- Require branches to be up to date before merging.
- Require signed commits.
- Do not allow force pushes or deletions.

Once the `maple/visual-review` check is live, add it as required and pin its
`integration_id` to the app from step 4 in the ruleset. Without that pin anyone
with push access can post a passing status under that name.

## 6. Before the repositories go public

- Re-read the history for anything that should not be published:
  `git log -p | grep -iE "<your own patterns>"`. The repositories were written
  to be publishable, so this should find nothing.
- Run `gitleaks detect --source . --log-opts="--all"` over the full history.
- Publish `SECURITY.md`'s reporting address and confirm it is monitored.
- Turn on Socket if step 3 deferred it.
