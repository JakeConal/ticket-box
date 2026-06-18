package com.ticketbox.vip;

import java.util.Optional;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
public class PhoneNormalizer {

    public Optional<String> normalize(String value) {
        if (!StringUtils.hasText(value)) {
            return Optional.empty();
        }
        String digits = value.replaceAll("\\D", "");
        if (!StringUtils.hasText(digits)) {
            return Optional.empty();
        }
        if (digits.startsWith("0084")) {
            digits = digits.substring(2);
        }
        if (digits.startsWith("84")) {
            return valid(digits);
        }
        if (digits.startsWith("0") && digits.length() > 1) {
            return valid("84" + digits.substring(1));
        }
        return valid(digits);
    }

    private Optional<String> valid(String digits) {
        if (digits.length() < 8 || digits.length() > 15) {
            return Optional.empty();
        }
        return Optional.of(digits);
    }
}
