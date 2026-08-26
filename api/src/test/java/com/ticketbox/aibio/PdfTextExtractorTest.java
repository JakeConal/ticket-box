package com.ticketbox.aibio;

import java.nio.file.Path;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PdfTextExtractorTest {

    @Test
    void extractWrapsIoFailureFromMissingFileAsPdfExtractionException() {
        ArtistBioProperties properties = new ArtistBioProperties();
        PdfTextExtractor extractor = new PdfTextExtractor(properties);

        assertThatThrownBy(() -> extractor.extract(Path.of("does-not-exist.pdf")))
                .isInstanceOf(PdfExtractionException.class)
                .hasMessage("PDF text extraction failed");
    }

    @Test
    void extractTimesOutWhenExtractionTimeoutIsEffectivelyZero() {
        ArtistBioProperties properties = new ArtistBioProperties();
        properties.setExtractionTimeout(Duration.ofNanos(1));
        PdfTextExtractor extractor = new PdfTextExtractor(properties);

        assertThatThrownBy(() -> extractor.extract(Path.of("does-not-exist.pdf")))
                .isInstanceOf(PdfExtractionException.class);
    }

    @Test
    void boundedStringWriterAccumulatesWithinLimit() throws Exception {
        var writerClass = Class.forName("com.ticketbox.aibio.PdfTextExtractor$BoundedStringWriter");
        var constructor = writerClass.getDeclaredConstructor(int.class);
        constructor.setAccessible(true);
        var writer = (java.io.Writer) constructor.newInstance(10);

        writer.write("hello");
        writer.flush();

        assertThat(writer.toString()).isEqualTo("hello");
    }

    @Test
    void boundedStringWriterThrowsWhenExceedingCharacterLimit() throws Exception {
        var writerClass = Class.forName("com.ticketbox.aibio.PdfTextExtractor$BoundedStringWriter");
        var constructor = writerClass.getDeclaredConstructor(int.class);
        constructor.setAccessible(true);
        var writer = (java.io.Writer) constructor.newInstance(5);

        writer.write("abc");

        assertThatThrownBy(() -> writer.write("defghij"))
                .isInstanceOf(java.io.IOException.class)
                .hasMessageContaining("Extracted text exceeded character limit");
        assertThat(writer.toString()).isEqualTo("abcde");

        writer.close();
    }
}
