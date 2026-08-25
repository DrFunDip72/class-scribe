# Class Scribe Business Model and Economics

**Last researched:** 2026-08-24
**Purpose:** Estimate what Class Scribe could earn, what would have to change before charging, and how much work each growth level would require.

This is a planning model, not accounting, legal, tax, or investment advice. Revenue is not profit. The contribution figures below exclude the owner's wages, taxes, refunds, chargebacks, and most legal or insurance costs.

## Executive conclusion

Class Scribe is already a functioning product, but it is not yet a functioning business. The present free stack is appropriate for validating demand with a small invited group. It is not appropriate for collecting payments as-is because Vercel limits its Hobby plan to personal, non-commercial use.

The most realistic first business is a focused student subscription:

- $9 per month for up to 20 processed audio hours, or a $39 five-month semester pass.
- A small free trial, such as two lifetime hours, rather than an unlimited free plan.
- An invite-only paid launch capped at 10-15 active users until long-recording speed, monthly usage, support load, and home-server reliability are measured.
- Expansion to 25 paid users only after four weeks of reliable beta operation.

At $9 per month, 10 paid users produce $90 monthly recurring revenue (MRR), while 25 produce $225 MRR. After estimated payment and baseline infrastructure costs—but before paying for the owner's time—the modeled monthly contribution is approximately $28 at 10 users and $154 at 25 users.

That makes the first version a demand-validation project and possible small side income, not a salary replacement. Roughly 100 paying users could produce about $900 MRR and approximately $787 per month before labor and taxes under the simple baseline model, but serving them reliably would probably require more than the current single home computer.

| Stage | Realistic operating target | Revenue | Estimated monthly contribution before owner labor and tax |
| --- | --- | ---: | ---: |
| Product today | Free, invited validation only | $0 | Negative once owner time is counted |
| Current system made sellable | 10-25 paid users | $90-$225 MRR | About $28-$154 |
| Current computer near a measured safe limit | Up to roughly 50 paid users, only if real usage permits | Up to $450 MRR | About $365 in the simple model |
| Dependable niche product | 100-300 paid users with redundant compute and ongoing operations | $900-$2,700 MRR | Rough scenario: $500-$2,000 |
| Real SaaS operation | Around 1,000 paid users and scalable cloud/multi-worker inference | About $9,000 MRR | Rough scenario: $5,000-$7,500 before salaries |

The first two rows are the useful near-term decision. The later rows show what more work could unlock; they are not sales forecasts.

## What is being sold

Class Scribe is not another meeting bot. Its clearest initial position is:

> Private, class-focused transcription and study guides for students who already have audio or video recordings.

The current product has useful differentiation:

- It accepts up to 20 audio or video recordings at once.
- Video is reduced to audio in the browser, so the original video never uploads.
- Recordings are processed by local AI rather than a metered cloud transcription API.
- Every user has a private account and saved transcript history.
- Results are formatted as streamlined study notes, with separate transcript and summary copy actions.
- Browser and optional email completion notifications let users leave the page while work continues.

The initial customer should be an individual college or vocational student. Selling to universities may eventually produce larger contracts, but institutional sales introduce procurement, accessibility, privacy, security review, contracts, administration, and potentially FERPA-related obligations. That is a later business, not the first one.

## Current commercial readiness

### What already exists

- A deployed web application and private account system.
- A durable, sequential processing queue.
- Working audio/video ingestion, local transcription, local summarization, and saved results.
- A functioning Windows startup worker.
- Browser and email completion notifications.
- A design that avoids per-minute AI API charges for transcription and summarization.

### What prevents charging today

1. **Vercel Hobby is non-commercial.** Vercel's [Hobby plan documentation](https://vercel.com/docs/plans/hobby) says it is for personal, non-commercial use. The app must move to Vercel Pro or another commercially permitted host before the first paid subscription is accepted. [Vercel lists Pro at $20 per month](https://vercel.com/pricing), including a usage credit.
2. **There is no billing or entitlement system.** The app cannot currently sell a plan, enforce an allowance, handle failed payments, or cancel access correctly.
3. **There are no usage limits.** One user could consume most of the monthly capacity.
4. **Long recordings have not been benchmarked on this computer.** No honest paid processing-time promise can be made yet.
5. **One home computer is a single point of failure.** Power, Internet, Windows updates, Ollama, or the worker can stop all processing.
6. **Sign-up email confirmation is disabled.** That is convenient for testing, but a paid product needs a deliberate account-verification and abuse-prevention design.
7. **Policies are missing.** A paid launch needs terms, a privacy policy, recording-consent guidance, a refund policy, and a defined data-retention policy.

## Market reference points

These are reference points, not a claim that the products are directly equivalent.

| Product | Current published reference | What it suggests |
| --- | --- | --- |
| [Otter](https://otter.ai/pricing) | Free: 300 minutes/month. Pro: $16.99 monthly or $8.49/user/month when billed annually, with 1,200 in-app minutes and 10 monthly file imports. | A student-facing $9 monthly offer is within the established range, but Class Scribe needs clear upload and study-guide differentiation. |
| [Notta](https://www.notta.ai/en/pricing/) | Free: 120 minutes/month. Pro advertises 1,800 transcription minutes and 100 uploads/month. | A small trial and a capped paid allowance are normal; unlimited free processing is unnecessary. |
| [Fireflies](https://fireflies.ai/pricing) | Pro: $18 monthly or $10/user/month annually, with unlimited transcription/summaries and 8,000 minutes of storage per seat. | Class Scribe should not compete on the word “unlimited” while it has one local worker. |

Class Scribe should initially compete on its class workflow, privacy boundary, batch uploads, and usable study notes—not on having the longest feature list.

## Capacity economics

### Storage and network capacity

Converted video uses mono 16 kHz AAC audio at approximately 48 kbps. At that bitrate:

```text
48,000 bits/second x 3,600 seconds / 8 = 21.6 MB per audio hour
```

The worker downloads the derived audio from Supabase, so that download counts as uncached egress. [Supabase Free currently includes 5 GB of uncached egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress).

```text
5,000 MB / 21.6 MB per hour = about 231 converted audio hours/month
231 hours x 80% planning utilization = about 185 safe planning hours/month
```

A heavy student with five one-hour classes per week would use about 20 audio hours per month. On that usage pattern, the free Supabase egress allowance supports only about nine heavy students with 20% headroom. Direct MP3 or WAV uploads can be much larger than converted M4A files, so actual capacity can be lower.

This is why a free-stack beta should be limited to approximately five to eight heavy active users. The exact limit should be based on measured egress, not registrations.

[Supabase Pro starts at $25 per month](https://supabase.com/pricing) and currently includes substantially more egress and storage. Moving to Pro removes the likely first capacity bottleneck and adds daily backups, but it does not solve local-worker availability.

### Local-compute capacity

The worker computer has an Intel Core i7-10700 with 8 cores/16 threads, 16 GB RAM, and no discrete GPU. The queue processes one recording at a time using `faster-whisper` small CPU INT8, followed by Ollama `qwen3:4b` summarization.

The official [faster-whisper benchmark](https://github.com/SYSTRAN/faster-whisper#benchmark) shows that CPU INT8 can process the small model well above real time on a newer i7-12700K, but that is not this machine and does not include Class Scribe's full download, transcription, Ollama, database, and notification pipeline.

Until real 30- and 60-minute measurements exist, use a deliberately broad planning range:

| Worker availability | Conservative 2 audio-hours per wall-clock hour | Planning case 4 audio-hours per wall-clock hour |
| --- | ---: | ---: |
| 8 hours/day, 30 days | 480 audio hours/month | 960 audio hours/month |
| 12 hours/day, 30 days | 720 audio hours/month | 1,440 audio hours/month |

At 20 audio hours per heavy user, that is a theoretical 24-72 heavy-user range. It is not a safe sales capacity. Bursty uploads, long summaries, retries, outages, maintenance, and the need for spare capacity all reduce the usable number. On the current architecture, paid enrollment should begin at 10-15 users and rise only from observed queue latency.

### Electricity

Electricity is likely to be smaller than labor and hosting at this stage, but it is not zero. An illustrative 100-watt processing load at $0.15/kWh costs $0.015 per processing hour. Actual whole-computer consumption, idle time, and the local utility rate are unknown.

Use a $5-$20 monthly electricity allowance until a plug-in power meter measures the worker. The financial model below uses $10.

## Recommended pricing model

### Initial offer

| Plan | Proposed price | Allowance | Purpose |
| --- | ---: | ---: | --- |
| Trial | $0 | 2 total audio hours | Let a student experience one or two real classes without creating a permanent free-service burden. |
| Student Monthly | $9/month | 20 audio hours/month | Align with roughly five one-hour classes per week. |
| Semester Pass | $39/5 months | 100 total audio hours | Match the academic buying cycle and reduce monthly cancellation friction. |
| Power Student | $15/month | 40 audio hours/month | Introduce only after capacity and support demand are measured. |

Allowances should measure processed audio duration, not uploaded file size or file count. “Unlimited” should not be offered on one home worker.

Unused monthly hours should initially expire rather than roll over. Rollover creates a future capacity liability when many users spend accumulated hours simultaneously.

### Why $9

- It is inexpensive enough for an individual student to try without institutional approval.
- It is comparable to annualized entry-level competitor pricing.
- At 20 included hours, it is $0.45 of revenue per processed audio hour if fully used.
- It leaves room for a future higher-capacity or cloud-backed plan.

The price is still a hypothesis. Interviews and an actual checkout test are more valuable than further spreadsheet refinement.

## Unit economics at $9 per month

[Stripe's standard US online-card price](https://stripe.com/pricing) is currently 2.9% plus $0.30 per successful domestic transaction, with no standard monthly fee.

Estimated payment fee per $9 subscriber:

```text
($9 x 2.9%) + $0.30 = $0.561
$9 - $0.561 = $8.439 after payment processing
```

### Modeled commercial baseline

| Cost | Monthly planning amount | Note |
| --- | ---: | --- |
| Vercel Pro | $20.00 | Required if continuing to use Vercel commercially. |
| Supabase Pro | $25.00 | Recommended when accepting recurring payments for capacity and backups. |
| Domain | $1.50 | Illustrative $18/year allowance. |
| Electricity | $10.00 | Placeholder until measured; likely range $5-$20. |
| FluxPrompt email | $0.00 in base model | Existing allowance is being used, but its volume limit and future price are unknown. |
| **Modeled fixed baseline** | **$56.50** | Excludes labor, tax, legal, insurance, refunds, and support tools. |

If Supabase Free is retained for a very small paid test, the modeled baseline falls to $31.50. That improves short-term break-even but leaves very little egress headroom and no daily-backup benefit. The safer recurring-revenue model includes Supabase Pro.

### Revenue and contribution scenarios

| Paid users | MRR | Annualized revenue | Stripe fees/month | Contribution after $56.50 baseline | Interpretation |
| ---: | ---: | ---: | ---: | ---: | --- |
| 10 | $90 | $1,080 | $5.61 | $27.89 | Validation, not meaningful income. |
| 25 | $225 | $2,700 | $14.03 | $154.48 | Small side income before labor. |
| 50 | $450 | $5,400 | $28.05 | $365.45 | Useful side income if usage and support remain controlled. |
| 100 | $900 | $10,800 | $56.10 | $787.40 | Operational reliability becomes more important than the current cost model shows. |
| 300 | $2,700 | $32,400 | $168.30 | $2,475.20 | Requires added compute, support, and monitoring; displayed contribution is overstated. |
| 1,000 | $9,000 | $108,000 | $561.00 | $8,382.50 | Current architecture cannot serve this; this is revenue-scale context, not a current forecast. |

The modeled baseline breaks even at seven $9 subscribers. That is infrastructure break-even only. It does not pay the owner for building, support, marketing, maintenance, or risk.

If the owner spends five hours per month on the product and values that time at $25/hour, labor adds $125 per month. Under that modest assumption, 10 users lose money and 25 users barely cover total economic cost. Founder time is the largest early expense.

## Three realistic levels of investment

### Level 1: Make the current product sellable

- **Goal:** Validate that students repeatedly use it and will pay.
- **One-time work:** approximately 40-80 focused engineering and operations hours.
- **Ongoing work:** approximately 3-5 hours per week for support, student outreach, and review.
- **Plausible target:** 10-25 paid students over 2-4 months, assuming direct access to relevant student communities.
- **Revenue range:** $90-$225 MRR.
**Modeled contribution:** about $28-$154/month before labor and tax.

Required work:

1. Benchmark actual 30- and 60-minute classes and a multi-file day.
2. Add audio-duration metering and monthly/lifetime allowances.
3. Add Stripe Checkout, subscription webhooks, a billing portal, failed-payment handling, and entitlement checks.
4. Upgrade or migrate the Vercel host before taking payments.
5. Decide whether Supabase Pro begins at launch or at a measured egress threshold.
6. Add bot protection, rate limits, verified ownership for paid accounts, and an abuse response.
7. Publish privacy, terms, refund, recording-consent, and data-retention policies.
8. Add a small admin view for users, usage, queue age, failures, and worker status.
9. Track activation, retained usage, processing time, failure rate, support time, and cancellations.

This is the recommended next level. It tests the business without prematurely rebuilding the infrastructure.

### Level 2: Build a dependable campus niche product

- **Goal:** Make Class Scribe reliable and polished enough for sustained word-of-mouth within several programs or campuses.
- **One-time work:** approximately 250-500 engineering/product hours.
- **Ongoing work:** approximately 10-20 hours per week across support, marketing, operations, and development.
- **Time horizon:** approximately 6-12 months.
- **Plausible target if retention is proven:** 100-300 paid users.
- **Revenue range at $9:** $900-$2,700 MRR.

Likely work:

- Redundant or multiple workers, automated failover, remote health alerts, and queue-capacity controls.
- Course folders, search, export, improved transcript correction, onboarding, referrals, and better result navigation.
- Product analytics, billing analytics, churn reporting, and cost dashboards.
- A defined support process, status communication, backups, recovery exercises, and deletion requests.
- Better speaker handling and accuracy evaluation on real classes.
- A repeatable acquisition channel such as student ambassadors, program partnerships, or referrals.

After added infrastructure, software, and support costs, a rough contribution range might be $500-$2,000/month before owner wages and taxes. That is a scenario, not a forecast; measured usage and retention determine whether it is attainable.

### Level 3: Turn it into a real SaaS company

- **Goal:** Support approximately 1,000 or more paying users with dependable service.
- **Work:** one to two full-time people for roughly 6-18 months, plus ongoing operations and customer support.
- **Revenue context at 1,000 users and $9:** $9,000 MRR or $108,000 annualized revenue.

A thousand heavy users at 20 audio hours each would demand 20,000 processed audio hours per month. The current single-PC system cannot provide that. This level requires:

- A horizontally scalable worker pool, probably with cloud or colocated GPU capacity.
- Queue autoscaling, observability, incident response, backups, and service objectives.
- Mature billing, fraud control, quota enforcement, analytics, and customer support.
- Formal privacy/security work, accessibility review, legal review, and potentially education-specific compliance.
- A reliable acquisition engine with known conversion, retention, churn, and customer acquisition cost.

An illustrative mature operating-cost range could be $1,500-$4,000 per month before salaries, depending heavily on inference design and support tooling. If 1,000 paid users were achieved, that could leave roughly $5,000-$7,500 per month before wages, taxes, and reinvestment. Neither the user count nor the margin should be treated as likely until the smaller stages prove retention.

## Customer acquisition and retention

There is no evidence yet for conversion rate, customer acquisition cost, or churn. Therefore, paid advertising would be premature.

The first validation group should contain 20-30 invited students and run for at least four active school weeks. Track:

- Sign-up to first successful result conversion.
- Audio hours per active user per week.
- Median and worst-case queue completion time.
- Week-four retention.
- Percentage willing to pay $9/month or $39/semester.
- Support minutes per active user.
- Failure/retry rate and worker downtime.
- Which output is actually used: summary, transcript, copy, or download.

Student usage is seasonal. A semester pass may fit the customer better than a year-round subscription and may reduce cancellations during each term. Referrals and student ambassadors are more appropriate early experiments than broad paid ads.

Do not calculate a dependable lifetime value until at least one full semester of retention data exists.

## Risks that can change the economics

| Risk | Economic effect | Near-term response |
| --- | --- | --- |
| Vercel Hobby restriction | Prevents compliant paid use on the current host plan. | Upgrade or migrate before charging. |
| Supabase Free egress | Limits a heavy-user beta to single-digit users. | Meter duration and egress; use Pro for paid growth. |
| One home worker | Outages stop all revenue-producing processing. | Cap enrollment, alert on outages, then add redundancy. |
| No real long-class benchmark | Capacity and completion-time estimates may be wrong. | Benchmark before advertising a turnaround time. |
| Disabled email confirmation | Raises abuse and account-ownership risk. | Add a deliberate verification/control flow for paid access. |
| Unknown FluxPrompt allowance | Completion-email cost or throttling could appear suddenly. | Confirm quota and price; preserve email as optional/non-blocking. |
| Private educational recordings | A privacy or consent failure can create reputational and legal cost. | Minimize data, preserve RLS, publish policies, and require lawful recording. |
| Strong incumbent products | Increases acquisition difficulty and limits price. | Focus on uploaded classes and study-guide quality. |
| Founder support time | Can erase small-scale contribution. | Measure it and automate repeated support work. |
| Seasonal churn | Reduces annual value per student. | Test semester pricing and campus referrals. |

## Recommended sequence

1. Keep the existing product free and invite-only while testing 20-30 students for four school weeks.
2. Measure the actual processing speed, egress, failure rate, usage per student, retention, and support time.
3. Interview the most active users and ask for a real $9/month or $39/semester commitment.
4. If at least 10 students commit, spend the estimated 40-80 hours on metering, billing, policies, abuse protection, and commercial hosting.
5. Launch a capped 10-15-user paid beta. Expand toward 25 only after queue and reliability targets hold.
6. At 25 retained paid users, decide whether the evidence justifies a redundant worker and Level 2 investment.
7. At 75-100 retained paid users, make redundant inference mandatory rather than optional.

The strongest near-term business case is not “make as much as possible.” It is “spend the least time necessary to learn whether 10-25 students will repeatedly pay.” If they do, the product has evidence worth scaling. If they do not, the owner avoids hundreds of hours of premature infrastructure work.

## Updateable formulas

Use these formulas when real measurements replace the assumptions:

```text
MRR = paid users x monthly price

Stripe fees = (MRR x 0.029) + (paid users x $0.30)

Monthly contribution = MRR
                       - Stripe fees
                       - fixed infrastructure
                       - variable compute/email costs

Converted-audio egress in GB = audio hours x 0.0216

Heavy-student capacity = safe available audio hours / 20

Economic profit = monthly contribution
                  - owner labor value
                  - tax, legal, refunds, chargebacks, and other omitted costs
```

## Measurements that would most improve this forecast

1. End-to-end minutes required for real 30- and 60-minute recordings.
2. Average monthly processed hours per retained student.
3. Four-week and full-semester retention.
4. The percentage of active beta users who actually pay $9 or $39.
5. Support time per user and the most common support problems.
6. Actual worker electricity consumption.
7. FluxPrompt's account-specific quota and paid overage price.
8. Home-worker uptime and the longest queue age during a normal class week.

Until those are measured, the 10-25-user result is the defensible near-term opportunity; the 100-1,000-user numbers are investment scenarios rather than promises.
