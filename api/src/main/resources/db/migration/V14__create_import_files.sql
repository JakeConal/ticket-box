CREATE TABLE import_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_name TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    summary JSONB,
    CONSTRAINT uq_import_files_content_hash UNIQUE (content_hash)
);

CREATE INDEX idx_import_files_processed_at ON import_files(processed_at);
