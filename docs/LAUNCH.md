# Launch gate

The build is technically complete but **public launch is blocked**. The site shows a "preview build" ribbon, `robots.txt` disallows indexing, and `content.launch.status` is `blocked` (the content rules refuse to approve launch while any placeholder or unverified item remains).

## Required before public launch

- [ ] Written confirmation from the election committee that the site complies with campaign rules (decision D-01)
- [ ] Written permission to use the Hormuud University name and logo, or remove them (the UI shows "LOGO TBC")
- [ ] Candidate-approved photo, uploaded over HTTPS, `photo.approved: true`
- [ ] Verified biography, academics, experience, philosophy and activities, each with `source` and `verifiedBy`
- [ ] Verified initiatives and milestones replacing every placeholder, statuses agreed (Proposed / Needs approval only)
- [ ] Native-speaker review of all Somali strings (`packages/shared/src/i18n.ts`, content)
- [ ] Manifesto PDF published (or the manifesto button stays "not yet published")
- [ ] Corrections contact (project email) set
- [ ] Privacy notice reviewed by the faculty; consent banner decision (D-07)
- [ ] Real-device performance test on the agreed device matrix (low-end Android, two mid-range Androids, two iPhones, budget laptop)
- [ ] Production deployment over HTTPS, admin accounts created, 2FA enabled for publishers/owners, backup restore tested
- [ ] Retention end date set to six months after the election
- [ ] Publish lock scheduled for any campaign silence period

## Flipping the switch

1. Publish verified content through the admin (two people), with `launch.status: "approved"` (the rules engine refuses this while placeholders remain).
2. Replace `apps/web/public/robots.txt` and remove `X-Robots-Tag` / `robots: noindex` (layout metadata) in the same reviewed change.
3. Rebuild and deploy the site.
