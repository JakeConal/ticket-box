package com.ticketbox.aibio;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class ArtistBioGenerationExceptionTest {

    @Test
    void messageOnlyConstructorTracksQuotaFlag() {
        ArtistBioGenerationException ex = new ArtistBioGenerationException("boom", true);

        assertThat(ex.getMessage()).isEqualTo("boom");
        assertThat(ex.isQuotaExceeded()).isTrue();
        assertThat(ex.getCause()).isNull();
    }

    @Test
    void messageAndCauseConstructorSetsBothAndFlag() {
        RuntimeException cause = new RuntimeException("root cause");
        ArtistBioGenerationException ex = new ArtistBioGenerationException("boom", false, cause);

        assertThat(ex.getMessage()).isEqualTo("boom");
        assertThat(ex.isQuotaExceeded()).isFalse();
        assertThat(ex.getCause()).isSameAs(cause);
    }
}
