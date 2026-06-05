## ADDED Requirements

### Requirement: Organizer can upload a PDF press kit for AI bio generation
An ORGANIZER SHALL be able to upload a PDF file for a concert, triggering automatic AI-generated artist bio creation.

#### Scenario: Valid PDF uploaded
- **WHEN** an ORGANIZER uploads a valid text-based PDF (≤ 20MB) for a concert
- **THEN** the system accepts the upload, stores the file, and returns HTTP 202 Accepted; the concert's bio status is set to GENERATING

#### Scenario: Non-PDF file rejected
- **WHEN** an ORGANIZER uploads a file that is not a PDF
- **THEN** the system returns HTTP 415 Unsupported Media Type and does not process the file

#### Scenario: PDF exceeds size limit
- **WHEN** an ORGANIZER uploads a PDF larger than 20MB
- **THEN** the system returns HTTP 413 Payload Too Large

### Requirement: System extracts text and generates bio asynchronously
After a PDF upload, the system SHALL process the file in the background: extract text, call the AI model, and store the generated bio.

#### Scenario: Successful text extraction and AI generation
- **WHEN** the background processor extracts non-empty text from the PDF and calls the Claude API
- **THEN** the system stores the generated bio in `concerts.artist_bio`, sets bio status to COMPLETE, and the bio appears on the public concert detail page

#### Scenario: Image-only PDF with no extractable text
- **WHEN** the background processor extracts zero or fewer than 50 characters from the PDF
- **THEN** the system sets bio status to FAILED, stores an error reason "Text extraction failed — please upload a text-based PDF", and surfaces the error in the admin dashboard

#### Scenario: Claude API call fails
- **WHEN** the Claude API returns an error or times out during bio generation
- **THEN** the system retries up to 2 times with exponential backoff; if all retries fail, bio status is set to FAILED with reason "AI generation failed — please try again"

### Requirement: Generated bio is displayed on the concert detail page
Once the bio is generated, the system SHALL display it on the public concert detail page.

#### Scenario: Bio displayed after generation completes
- **WHEN** bio status transitions to COMPLETE
- **THEN** the concert detail page shows the AI-generated bio in the artist information section without requiring a page republish

#### Scenario: Concert detail shown while bio is generating
- **WHEN** a user views a concert detail page while bio status is GENERATING
- **THEN** the page renders normally, showing a "Artist bio coming soon..." placeholder in the bio section

### Requirement: Organizer can re-upload to regenerate the bio
An ORGANIZER SHALL be able to upload a new PDF to replace and regenerate the artist bio.

#### Scenario: Re-upload triggers new generation
- **WHEN** an ORGANIZER uploads a new PDF for a concert that already has a generated bio
- **THEN** the system overwrites the previous bio status to GENERATING, processes the new PDF, and replaces the displayed bio upon completion
