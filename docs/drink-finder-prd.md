# Goal-based drink finder PRD

Status: The agreed browser-only MVP was first deployed on 2 October 2026. The current demo is at [sbx.utf.sh](https://sbx.utf.sh/), with a Starbucks Singapore-inspired phone interface, catalogue, finder, recipe details and working demo cart. Catalogue research is recorded; exact size-specific prices remain unverified and use labelled demo fixtures. Software verification is recorded in `tests/README.md`. User validation and wireframe documentation remain pending.

## Confirmed direction

- Company and market: Starbucks Singapore.
- Product direction: an optional drink finder that turns a customer's goal and preferences into explained recommendations.
- Project approach: feature improvement of the drink discovery and ordering experience.
- MVP lead: Faqih.
- This Markdown file is the working implementation PRD and can later be adapted for the project document.
- The selected browser-only stack is recorded below. Cloudflare Pages serves the deployed static client; updates currently use manual production uploads.
- Build and iterate the complete agreed MVP before documenting wireframes. Problem evidence remains a group/report input, not a prerequisite for starting implementation.

## Product brief

Primary user: discovery customers choosing something unfamiliar, including new or infrequent customers and regulars exploring beyond their usual order.

Problem hypothesis: some discovery customers know what they want a drink to be like but struggle to translate that into a menu choice. The group's research must establish whether this occurs and which parts of the current experience cause difficulty.

Desired outcome: help the customer choose a suitable drink they understand and feel confident ordering. Faster selection and trying something new are secondary benefits, subject to testing.

Core user story: As a customer choosing something unfamiliar, I want to describe my goal and preferences and understand which drinks fit, so I can choose a suitable drink confidently.

## Decision agenda

| ID | Decision | Status |
| --- | --- | --- |
| D01 | Primary user and discovery situation | Agreed |
| D02 | Specific problem, user benefit and outcome to test | Agreed; evidence pending |
| D03 | Where the experience starts and ends | Agreed |
| D04 | Goals, questions and optional preferences | Agreed |
| D05 | Drink catalogue, required attributes and data sources | Scope agreed; source findings in the research note |
| D06 | Matching, ranking and recommendation explanations | Policy agreed; proposed ranking below |
| D07 | Results, details, comparison and any customisation | Agreed |
| D08 | No match, fewer results, changed answers and other necessary states | Agreed |
| D09 | Validation tasks, baseline and success measures | Software tests added; comparative user pilot pending |
| D10 | Complete MVP scope and acceptance criteria | Implemented; software verification recorded separately |
| D11 | React + TypeScript + Vite, with Tailwind | Agreed |
| D12 | Browser-only catalogue/matching and current-session persistence | Agreed |

## MVP scope and behaviour

Build the complete agreed MVP scope, then improve it from testing and feedback. The scope below is one coherent product experience; it is not split into a separate first-build phase.

### Journey boundary

The working demo starts at a small browseable menu with an optional Find My Drink entry. It continues through questions, recommendations and drink details, and ends when the user adds a selected drink to a working demo cart.

Normal menu browsing is available as an alternative route and as a baseline for comparison testing. Both routes should use the same catalogue and product information.

Checkout, payment and order fulfilment are outside the agreed demo boundary.

### Question flow

Customers tap one understandable goal to go straight to the optional preference questions. There is no separate Continue step. Back retains the optional answers. Changing goals updates the implied temperature; entering Coffee boost from another goal resets temperature to Either.

Goals: refreshing; a coffee boost; warm and comforting. These labels are inspired by [Starbucks' discovery examples](https://about.starbucks.com/press/2026/a-new-way-to-inspire-your-starbucks-order/) and must be checked with users. Their mappings to drink attributes will be specified with the matching rules.

Current optional preferences: coffee content, sweetness and milk, with temperature shown only for Coffee boost. Refreshing uses iced recipes; Warm and comforting uses hot recipes. Budget is deferred from the current UI, and old saved budget limits are ignored. Coffee-free and caffeine-free are distinct; the coffee question must not imply the absence of caffeine. Preference helper copy is omitted; any unavailable-options notice appears below the clear action.

Proposed labels to refine in the working interface:

| Preference | Options and meaning |
| --- | --- |
| Temperature | Either; iced; hot, only for Coffee boost. Other goals set iced or hot automatically. |
| Coffee | No preference; no coffee, only outside Coffee boost. Coffee ingredients include coffee extract, not just espresso. |
| Sweetness | No preference; less sweet; sweeter. Published default-recipe sugar per 100 mL is a rough ranking guide, not a guarantee of perceived sweetness. |
| Milk | No preference; dairy milk; oatmilk; no milk in the described recipe. These are recipe-basis choices, not complete ingredient or allergen-safety guarantees. |
| Budget | Deferred from the current UI. Saved limits must not silently filter recommendations. |

### Catalogue and data

Start with approximately 12 verified Singapore drink recipes or variants, selected to cover the three goals and agreed preferences. Recipe variants count as catalogue entries when their attributes or prices differ.

Record only attributes used by the flow or recommendations: identity, image, recipe/size, price, temperature, coffee content, sweetness description, milk, relevant ingredients, goal tags and availability. Keep a source and verification date for factual attributes. Unknown information must not be invented to make a recommendation fit.

Use one fixed demo store context with prepared availability data. Stock is simulated and is not a claim about a real outlet's current inventory. An unavailable-item test case must use this prepared data consistently across browsing, finder results and cart handling.

The [MVP research note](mvp-research.md) records candidate recipes, published attributes and unresolved data. Exact size-specific Singapore prices remain unverified. Coding may use fixed, explicitly simulated sizes/prices while those factual fields remain unknown. Mark them as demo data in the interface; never present delivery "from" prices as exact in-store prices.

### Matching and explanations

Use deterministic filters and ranking over the catalogue. Proposed rule order:

| Order | Rule |
| --- | --- |
| 1 | Remove unavailable recipes and any recipe that fails a selected or goal-derived hard requirement. Unknown required values cannot pass. |
| 2 | Put recipes with the selected curated goal tag first. Goal tags must have a documented ingredient/temperature rationale. |
| 3 | Within each goal-fit group, use published sugar ascending for "less sweet" or descending for "sweeter". Known comparable values precede unknown values; no sweetness preference skips this rule. |
| 4 | Break remaining ties by stable recipe ID. Return up to three eligible recipes. |

These priorities are a testable design choice, not an empirically optimised formula. If a result meets the hard requirements but not the goal, identify it as an alternative rather than claiming a full match. Coffee boost omits coffee exclusion and clears contradictory saved answers. If stock leaves only non-coffee recipes eligible, explain the unmet coffee goal. Do not turn Coffee boost into a claim about measured caffeine or physiological effects.

Each result explains its match using stored recipe attributes. A recommendation explanation must remain consistent with the chosen recipe and the user's answers.

Hard requirements: coffee exclusion, milk requirements and selected or goal-derived temperature. Do not silently relax them. If a required attribute is unknown, do not present the recipe as a confirmed match for that requirement.

Soft preferences: the chosen goal and sweetness preference influence ranking among compatible recipes. Explain how each result fits and avoid implying that a partial preference match satisfies every request.

Factual attributes require sources. Goal and taste tags are curated classifications to document and check with users, not measured health or nutrition claims.

### Results and details

Show up to three explained recommendations. Display fewer when fewer recipes qualify. Each result shows its name, image, recipe price, relevant attributes, a concise match explanation and a drink-details action.

The user can inspect a choice before adding it to the demo cart. Use preset recipes rather than dynamic ingredient editing. Discovery shows the Tall demo size and price. The drink page offers Tall, Grande and Venti, plus Short for hot recipes, with simulated size-specific prices. Include predefined milk variants where verified and needed for the catalogue's coverage.

The exact recipe shown in the recommendation must be the recipe added to the cart. A selected size changes the displayed price and cart line, not the recipe identity or matching attributes. Chat cards show the Tall base price; Add to order opens a size drawer with Tall initially selected. Only confirmation adds the chosen size, and closing adds nothing. Different sizes of one recipe stay separate in the cart, and each line's quantity and total use its own size price. Details show the size and milk basis clearly. Syrup, shot, milk-substitution and topping editors remain outside the agreed scope. This size-selection extension was requested on 3 October 2026; its data policy is recorded in [Drink sizes](drink-sizes.md).

The cart also offers an explicit Edit action that opens a size drawer. Update order changes the existing line rather than adding another drink, retains its quantity and recalculates totals. Matching drink-size lines merge without dropping quantities; a merge above the demo limit of 99 is blocked. Closing the drawer does not save the draft. Detail-page additions keep their existing add behaviour.

### Essential alternative states

- No match: explain that no available recipe meets the requirements, preserve answers, and offer editing or returning to the menu. Never silently relax requirements.
- One or two matches: show only those qualifying recipes.
- Changed answers: preserve the other answers and recompute results so that explanations and prices remain current.
- Unavailable recipe: exclude it from recommendations and prevent adding it to the cart. If availability changes after selection in a prepared test case, explain the change and offer a return to results or browsing.

### Scope priorities

All agreed journey features, recommendation rules and essential alternative states are required for the complete MVP. Automated checks should cover the matching rules and critical flow; usability testing should inform refinement.

The agreed scope does not include account creation, live store integration, real payments or fulfilment, purchase-history personalisation, free-text AI recommendations, general recipe editing, favourites or an in-app feedback feature. Adding any of these would be a new scope decision.

### Acceptance criteria

| ID | Observable condition |
| --- | --- |
| AC01 | Users can browse the catalogue or enter the finder, inspect a recipe and add it to the demo cart. |
| AC02 | Every recommendation respects coffee exclusion, milk requirements and selected or goal-derived temperature. Unknown required attributes do not count as a confirmed match; retired budget limits do not filter results. |
| AC03 | Results contain at most three eligible, available recipes in the order defined by the documented scoring and tie-breaking rules. |
| AC04 | Explanations refer to stored attributes and accurately describe both matches and partial preference fits. |
| AC05 | Editing answers preserves unchanged choices and recomputes recommendations and explanations. |
| AC06 | One or two qualifying recipes produce one or two results. Zero produces an explanation and recovery controls while preserving the user's answers. |
| AC07 | Unavailable recipes cannot be added to the cart, including an availability-change test case after selecting a result. |
| AC08 | Discovery and chat cards show Tall prices. Detail-page size selection and the chat Add-to-order drawer preview the chosen price and add that size only on confirmation. Cancelling the drawer does not change the cart. Different sizes do not merge; recipe identity and milk basis remain unchanged. |
| AC09 | With browser storage available, a same-tab refresh restores answers and cart. Reset clears this demo's saved state; blocked or invalid storage does not prevent using the current in-memory flow. |

Before coding the matching rules, prepare representative test fixtures for each criterion, including conflicting requirements, unknown attributes and no matches. Record actual test results after running them.

## Selected stack

| Part | Decision |
| --- | --- |
| Interface | React + TypeScript + Vite. |
| Styling | Tailwind CSS. |
| Catalogue and matching | Versioned typed data in the repo, shared by all routes; pure TypeScript filter/ranking logic. |
| Backend/database | None for this scope. The catalogue, prepared stock and demo cart run in the browser. |
| State | React state plus `sessionStorage` for answers and cart. Include a demo reset; handle unavailable storage gracefully. No account or personal details. |
| Hosting | Cloudflare Pages Direct Upload, project `fmd`, with HTTPS at `sbx.utf.sh`. A dedicated CNAME leaves the existing wildcard and other hosted sites unchanged. |

Recompute recommendations from current answers and catalogue data. Store recipe references and quantities rather than a second independent catalogue in browser storage; check saved state when restoring it. Pinned Vitest and Playwright packages cover the rule/session checks and critical browser flows for AC01-AC09; actual results are recorded in `tests/README.md`.

## Validation

Run a comparative usability pilot with approximately five relevant discovery customers. This is a practical initial sample recommendation, not a course-mandated count. Clearly identify any proxy participants.

Compare the Browse and Finder routes using equivalent goal-based tasks on the same catalogue, prices and availability. Vary the order of the two routes and use comparable tasks to reduce learning effects.

Primary measures: suitable-choice completion and confidence in the choice. A successful task respects its stated requirements and has an understandable fit with the goal. Supporting measures: decision time, backtracking and explanation comprehension.

Record the observed results, usability problems and revisions. Testing has not yet been performed. Separate prototype task completion from the future business hypothesis of improved checkout completion or contribution. A simulated cart cannot establish real sales, revenue uplift or repeat purchase.

The group's problem research is a separate input: it must establish the actual selection difficulties before the concept can be described as solving a validated pain point.

## Preparation and delivery order

- The frontend, browser-only architecture and session persistence are implemented. The production build is deployed to Cloudflare Pages; later changes require a new production upload.
- Prepare the catalogue and rule-test fixtures, separating verified facts from simulated price, size and stock values.
- Implement the complete agreed journey and alternative states, then iterate in code.
- Capture the resulting user flows, wireframes/UI designs and screenshots for the submission; they do not need to precede implementation.
- Run the planned comparative pilot and record results and revisions. The group's persona, current journey and problem evidence can progress in parallel for the report.

## Course alignment

- The official evaluation framework assigns 35% to Execution, Design and Functional MVP. It names PRDs and user stories, MVP scoping, UI/UX wireframes and a working prototype matching design choices.
- Its MVP clarification expects high-fidelity design with interactive navigation mapped to user journeys. Where data issues prevent integration, detailed screenshots and user flows support evaluation.
- Discovery and Strategy requires evidence-backed pain points, personas, journey mapping, strategy and KPIs. The PRD therefore needs inputs from the group's discovery work.
- The brief requires major product decisions to be supported by evidence. The PRD lecture covers goals, users, features, constraints, UX and measurable acceptance criteria, followed by team review before building.

## References

- [Group Project Evaluation Framework, pp. 1-2](https://ntulearn.ntu.edu.sg/ultra/courses/_2709135_1/file/_6130732_1?courseId=_2709135_1), read on 2 October 2026.
- Project Brief, pp. 1-2: local course file `SC4025_Project_Brief_Student.pdf`.
- [Week 6: Product Requirements and Specifications](https://ntulearn.ntu.edu.sg/ultra/courses/_2709135_1/file/_5921046_1?courseId=_2709135_1), pp. 3-6, 9-11 and 13.
- Supporting lectures: Week 2 Discovery, Week 3 Design Thinking, Week 5 Metrics and Week 7 Agile and Lean. Specific decisions will cite relevant concepts as they are settled.
