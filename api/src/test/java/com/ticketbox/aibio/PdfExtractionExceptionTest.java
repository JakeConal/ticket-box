package com.ticketbox.aibio;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class PdfExtractionExceptionTest {

    @Test
    void messageOnlyConstructorSetsMessage() {
        PdfExtractionException ex = new PdfExtractionException("boom");

        assertThat(ex.getMessage()).isEqualTo("boom");
        assertThat(ex.getCause()).isNull();
    }

    @Test
    void messageAndCauseConstructorSetsBoth() {
        RuntimeException cause = new RuntimeException("root cause");
        PdfExtractionException ex = new PdfExtractionException("boom", cause);

        assertThat(ex.getMessage()).isEqualTo("boom");
        assertThat(ex.getCause()).isSameAs(cause);
    }
}
