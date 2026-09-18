# Owner setup

Everything in this file has to be done by a person with owner rights. None of it
can be automated from inside the repository, which is why it is a checklist
rather than a script. Work top to bottom; later steps depend on earlier ones.

Nothing here should ever be committed. Where a step produces a credential, keep
it in a password manager and inject it with `op run --env-file`, never in a file.

---

## 1. The npm scope `@maple-kit` — done

The organisation exists and the packages publish as `@maple-kit/core`,
`@maple-kit/cli` and `@maple-kit/mcp`. The unhyphenated `maplekit` was
unavailable on npm, which is why the scope matches the GitHub organisation
rather than being shorter than it.

Two things remain, both under the npm organisation's settings:

- **Members**: add anyone who will publish.
- **Require two-factor authentication** for all members.

Publishing needs `registry.npmjs.org`, so it cannot be done from a network that
blocks or proxies it.

## 2. Configure the GitHub organisation

1. The repositories live under the `maple-kit` organisation.
2. In **Settings → Actions → General**, set workflow permissions to
   _Read repository contents and packages permissions_. The workflows here ask
   for anything more per job.
3. **Dependabot alerts** and **Dependabot security updates** are already enabled
   on all three repositories.
4. **Secret scanning and push protection — enabled.** Both were refused while
   `maple` was private, because a Free organisation needs GitHub Advanced
   Security for them on a private repository. They are free on a public one and
   were turned on with the flip in section 5. The gitleaks hook and the gitleaks
   CI job stay: a contributor can skip the hook with `--no-verify`, and push
   protection catches what reaches the remote rather than what reaches a commit.
5. **Private vulnerability reporting — enabled.** Also public-repository only.
   `SECURITY.md` links to it, so it had to be on or that link was dead.
6. _Allow members to create public repositories_ cannot be turned off on a Free
   organisation; GitHub refuses a private-only creation policy. Nothing to do.

## 3. Socket.dev — done

Socket reviews every dependency change for install scripts, obfuscated code and
sudden maintainer changes. It is the control that catches a compromised release
that a version bump alone would hide.

Installing a third-party GitHub App needs a person to authorise it in a browser.
There is no API for it, which is the only reason this section is manual.

1. Install the GitHub app from <https://github.com/apps/socket-security> onto
   the `maple-kit` organisation.
2. Grant it access to all repositories, including future ones.
3. Confirm whether the free tier covers private repositories on your plan. If it
   does not, note it and enable Socket at the point the repositories go public;
   do not leave it half-configured.
4. **Start it in report-only mode, not as a required check.** Socket's
   `Obfuscated code` rule fires on minified and generated files, so it flags
   mainstream packages: `highlight.js`, every `@mswjs/interceptors@0.41.x`, and
   every version of `better-sqlite3` were all refused by a registry mirror
   running this engine during Phase 0. As a merge gate that would block real
   work. Watch what it reports for a few weeks before making it blocking.

Verify: open a pull request that adds a dependency and confirm Socket comments.

## 4. Register the GitHub App — done

One app serves both the comment posting in US1 and the merge gate in US2.

**It exists: <https://github.com/apps/maple-kit>**, installed on the `maple-kit`
organisation with access to all repositories, Device Flow on, and the
permissions in the table below. Verified by signing a JWT with its private key,
minting an installation token, and asking GitHub for a device code.

Note the app is named `maple-kit`, not `Maple`: GitHub App names are globally
unique and `Maple` was taken.

The private key is shown once, at creation, and is not recoverable. If it is
lost, generate a new one on the app's settings page and revoke the old one.

The rest of this section is the record of how it was configured, for whoever has
to recreate or audit it.

The quickest route is an **app manifest**: POST one to
`https://github.com/organizations/maple-kit/settings/apps/new` from a local page,
review GitHub's confirmation screen, and the app is created with every permission
below already set. A manifest cannot enable Device Flow or generate the key, so
4a and step 7 apply either way.

Filling the form by hand instead:

1. Go to **Organisation settings → Developer settings → GitHub Apps → New**.
2. Name it `Maple`. Homepage: `https://github.com/maple-kit/maple`.
3. **Uncheck Webhook → Active** for now. US2 turns it on with a real URL.
4. Under **Identifying and authorising users**:
   - **(4a) Enable Device Flow.** This is what lets a reviewer sign in from a
     preview host without a redirect URI per deployment, and it is the one
     setting a manifest cannot carry. Maple's login story depends on it.
   - Enable **Expire user authorisation tokens**.
   - Leave **Request user authorisation (OAuth) during installation** off.
5. Permissions — **Repository**:
   | Permission    | Access         | Why                                                                                                                             |
   | ------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------- |
   | Checks        | Read and write | The `maple/visual-review` check run is the merge gate.                                                                          |
   | Pull requests | Read and write | Posting and updating the sticky comment.                                                                                        |
   | Contents      | Read-only      | Reading the commit a comment was anchored against.                                                                              |
   | Merge queues  | Read-only      | Required to subscribe to `merge_group` at all. Without it GitHub rejects the event and a queued merge hangs instead of passing. |
   | Metadata      | Read-only      | Mandatory.                                                                                                                      |
6. **Where can this app be installed?** Any account, so other organisations can
   use the gate.
7. Create the app, then:
   - Note the **App ID** and the **Client ID**.
   - Generate a **private key** and store the `.pem` in a password manager. It
     is downloaded once and never shown again. `*.pem` is gitignored, but the
     file should not be in the working tree at all.
8. Install the app on the `maple-kit` organisation.

## 5. Branch protection — done

**Enabled at the start of US1.** Phase 0 was built by pushing straight to
`main`; from US1 on, every change goes through a pull request.

It is a **repository ruleset** on `maple-kit/maple` named `main`, targeting
`~DEFAULT_BRANCH`, enforcement `active`:

| Rule                     | Setting                                                                        |
| ------------------------ | ------------------------------------------------------------------------------ |
| `pull_request`           | One approving review, stale reviews dismissed on push                          |
| `required_status_checks` | `lint` `typecheck` `format` `test` `build` `gitleaks` `lockfile` `dco`, strict |
| `required_signatures`    | Every commit signed                                                            |
| `non_fast_forward`       | No force pushes                                                                |
| `deletion`               | `main` cannot be deleted                                                       |

Three things about that table are worth the words.

**The check names are CI job ids, not script names.** `publint` and
`arethetypeswrong` are steps inside the `build` job, so `build` is the context
GitHub sees; requiring `publint` by name would wait forever on a check that
never reports. `lockfile` and `format` are jobs in their own right. Read the job
ids out of `.github/workflows/ci.yml` before changing this list.

**`dco` only runs on a pull request.** The job carries
`if: github.event_name == 'pull_request'`, which is correct — there is no base
to diff against on a push — and harmless here, because the ruleset only gates
merges.

**Repository admin is a bypass actor.** A single maintainer cannot approve their
own pull request, so with one required approval and no bypass the repository
would be unmergeable by the only person in it. The approval requirement still
applies to everyone else. Remove the bypass once there is a second reviewer.

### Why the repository is public

A ruleset is not available on a private repository in a Free organisation.
GitHub refuses both the rulesets and the branch-protection endpoints with
`403 Upgrade to GitHub Pro or make this repository public`. The three ways out
were a paid plan, no server-side enforcement, or the flip to public that
section 6 was always heading towards. The flip was chosen, and it also turned on
the three controls in section 2 that a private Free repository cannot have.

### Signed commits

`required_signatures` verifies against keys registered on the **author's**
account, so it needs a signing key before it can be satisfied. SSH signing is
configured per repository rather than globally, for the same reason the commit
identity is:

```
git config --local gpg.format ssh
git config --local user.signingkey ~/.ssh/<key>.pub
git config --local commit.gpgsign true
```

The public half is added at <https://github.com/settings/ssh/new> with **Key
type: Signing Key** — an authentication key of the same value does not count,
and a commit signed by a key GitHub does not know reads as `Unverified` and is
refused by the rule.

### Still to add

Once the `maple/visual-review` check is live, add it as required and pin its
`integration_id` to the app from step 4. Without that pin anyone with push
access can post a passing status under that name.

## 6. Before a repository goes public

`maple` is public. `maple-action` and `maple-tui` are still private and each
needs this list run over it before it flips.

- Re-read the history for anything that should not be published:
  `git log -p | grep -iE "<your own patterns>"`. These repositories were written
  to be publishable, so this should find nothing. On `maple` it found nothing.
- Run `gitleaks git --redact --verbose --exit-code 1 .` over the full history.
  This is the same invocation the CI job uses, so a pass here predicts a pass
  there.
- Confirm `SECURITY.md` points somewhere that works. It links to GitHub's
  private vulnerability reporting, which only exists once the repository is
  public and the setting is on — so the link is dead until both are true.
- **Enable secret scanning, push protection and private vulnerability
  reporting** immediately after the flip. All three are free on a public
  repository and unavailable on a private one in a Free organisation.
- Enable a ruleset on `main`. Same reason: section 5's rules need the repository
  to be public on this plan.
