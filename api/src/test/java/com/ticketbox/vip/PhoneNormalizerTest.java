package com.ticketbox.vip;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class PhoneNormalizerTest {

    private final PhoneNormalizer normalizer = new PhoneNormalizer();

    @Test
    void vietnamPhoneVariantsNormalizeToOneCanonicalValue() {
        assertThat(normalizer.normalize("0901 234 567")).contains("84901234567");
        assertThat(normalizer.normalize("+84 901 234 567")).contains("84901234567");
        assertThat(normalizer.normalize("0901-234-567")).contains("84901234567");
        assertThat(normalizer.normalize("0084 901 234 567")).contains("84901234567");
    }

    @Test
    void missingOrInvalidPhoneIsRejected() {
        assertThat(normalizer.normalize("")).isEmpty();
        assertThat(normalizer.normalize("abc")).isEmpty();
        assertThat(normalizer.normalize("123")).isEmpty();
    }
}
