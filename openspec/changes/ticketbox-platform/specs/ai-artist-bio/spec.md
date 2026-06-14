## ADDED Requirements

### Requirement: Organizer can upload a PDF press kit for AI bio generation
An ORGANIZER SHALL be able to upload a PDF file for a concert, triggering automatic AI-generated artist bio creation.

API contract: `POST /api/admin/concerts/{id}/artist-pdf` is ORGANIZER-only and ownership-scoped. It accepts a PDF upload, validates it, starts async generation, and returns HTTP 202.

#### Scenario: Valid PDF uploaded
- **WHEN** an ORGANIZER uploads a valid text-based PDF (≤ 20MB) for a concert
- **THEN** the system accepts the upload, stores the file, and returns HTTP 202 Accepted; the concert's bio status is set to GENERATING

#### Scenario: Non-PDF file rejected by content inspection
- **WHEN** an ORGANIZER uploads a file that is not a real PDF (including a non-PDF file renamed with a `.pdf` extension)
- **THEN** the system detects this by inspecting the file's magic bytes (not just the extension or declared Content-Type), returns HTTP 415 Unsupported Media Type, and does not process the file

#### Scenario: PDF exceeds size limit
- **WHEN** an ORGANIZER uploads a PDF larger than 20MB
- **THEN** the system returns HTTP 413 Payload Too Large

#### Scenario: Encrypted or password-protected PDF rejected
- **WHEN** an ORGANIZER uploads a PDF that is encrypted or password-protected
- **THEN** the system rejects it with a clear error rather than failing later in extraction

#### Scenario: Decompression-bomb PDF does not exhaust resources
- **WHEN** an uploaded PDF is small on disk but expands enormously during text extraction
- **THEN** extraction is bounded by a timeout and a page/character ceiling; if exceeded, the system aborts extraction and sets bio status to FAILED with a clear reason rather than exhausting CPU/memory

### Requirement: System extracts text and generates bio asynchronously
After a PDF upload, the system SHALL process the file in the background: extract text, call the AI model, and store the generated bio.

#### Scenario: Successful text extraction and AI generation produces a draft
- **WHEN** the background processor extracts non-empty text from the PDF and the Google Gemini API returns a generated bio
- **THEN** the system stores the generated text in `artist_bio_draft` as a DRAFT (status DRAFT, not yet public), visible to the ORGANIZER in the admin dashboard for review — it does NOT appear on the public concert detail page until published

#### Scenario: Image-only PDF with no extractable text
- **WHEN** the background processor extracts zero or fewer than 50 characters from the PDF
- **THEN** the system sets `bio_status = FAILED`, stores `bio_error = "Text extraction failed — please upload a text-based PDF"`, and surfaces the error in the admin dashboard

#### Scenario: Gemini API call fails
- **WHEN** the Google Gemini API returns an error or times out during bio generation
- **THEN** the system retries up to 2 times with exponential backoff; if all retries fail, it sets `bio_status = FAILED` and `bio_error = "AI generation failed — please try again"`

#### Scenario: Gemini free-tier quota exceeded
- **WHEN** the Google Gemini API returns a quota/rate-limit error (HTTP 429) because the free-tier limit is reached
- **THEN** the system retries with backoff and, if still throttled, sets `bio_status = FAILED` and `bio_error = "AI service busy — please try again later"` without losing the uploaded PDF URI, so the organizer can re-trigger generation

#### Scenario: Generation interrupted by a server restart is not stranded
- **WHEN** a bio has been in GENERATING status longer than the configured threshold (e.g. 5 minutes) — for example because the application restarted mid-generation
- **THEN** a scheduled reaper transitions the stuck row out of GENERATING (re-queues it or marks it FAILED), so no concert is left permanently showing "generating"

#### Scenario: Concurrent regenerations do not overwrite newer content with older
- **WHEN** an ORGANIZER uploads PDF A, then quickly uploads PDF B, and A's generation finishes after B's
- **THEN** each upload carries an increasing generation token and a completing task writes its result only if its token is still the latest; A's late result is discarded so the newer B bio is preserved

### Requirement: AI-generated bio requires organizer approval before going public
Because the bio is AI-generated from untrusted third-party content about real, named people, the system SHALL require explicit ORGANIZER approval before the bio is shown publicly, and SHALL allow the organizer to edit it first.

API contract: `GET /api/admin/concerts/{id}/artist-bio` returns draft/status/error details, `PUT /api/admin/concerts/{id}/artist-bio` edits draft text, `POST /api/admin/concerts/{id}/artist-bio/publish` publishes it, and `POST /api/admin/concerts/{id}/artist-bio/reject` rejects it. All are ORGANIZER-only and ownership-scoped.

#### Scenario: Organizer publishes a reviewed draft
- **WHEN** an ORGANIZER reviews a DRAFT bio (optionally editing the text) and approves it
- **THEN** the system copies `artist_bio_draft` into the public `artist_bio` field, clears the draft/error fields, sets `bio_status = PUBLISHED`, and the bio becomes visible on the public concert detail page

#### Scenario: Organizer rejects a draft
- **WHEN** an ORGANIZER rejects a DRAFT bio
- **THEN** the system clears `artist_bio_draft`, sets `bio_status = REJECTED`, stores any organizer-provided reason in `bio_error`, and the organizer may re-upload a different PDF or discard it; any previously published `artist_bio` remains public

#### Scenario: Public page hides non-published bios
- **WHEN** a user views a concert detail page before any bio has been published and the current bio status is GENERATING, DRAFT, FAILED, REJECTED, or absent
- **THEN** the page renders normally showing an "Artist bio coming soon..." placeholder — drafts, errors, and rejected text are never shown publicly

### Requirement: Published bio is displayed on the concert detail page
Once a bio is PUBLISHED, the system SHALL display it on the public concert detail page and keep the cached page consistent.

API contract: `GET /api/concerts/{id}` includes only the public `artist_bio` text. If no `artist_bio` has been published yet, it returns status/placeholder data suitable for the public page without exposing `artist_bio_draft` or `bio_error`. A previously published `artist_bio` remains visible while a newer draft is GENERATING or awaiting review.

#### Scenario: Bio displayed after publishing
- **WHEN** bio status transitions to PUBLISHED (or an organizer edits an already-published bio)
- **THEN** the system actively invalidates the cached concert detail page and the AI-generated bio appears in the artist information section without requiring a page republish

### Requirement: Organizer can re-upload to regenerate the bio
An ORGANIZER SHALL be able to upload a new PDF to replace and regenerate the artist bio.

#### Scenario: Re-upload triggers new generation
- **WHEN** an ORGANIZER uploads a new PDF for a concert that already has a bio
- **THEN** the system sets bio status to GENERATING, processes the new PDF, and produces a new DRAFT for review; the previously published bio remains visible until the new one is published

#### Scenario: Regeneration rate limit
- **WHEN** an ORGANIZER triggers regeneration more frequently than the configured limit for a concert
- **THEN** the system rejects the excess attempts so repeated uploads cannot drain the free-tier quota or run up cost
