package com.ticketbox.auth.service;

import com.ticketbox.auth.dto.CheckerAccountResponse;
import com.ticketbox.auth.dto.CreateCheckerAccountRequest;
import com.ticketbox.auth.model.User;
import com.ticketbox.auth.model.UserRole;
import com.ticketbox.auth.repository.RefreshTokenRepository;
import com.ticketbox.auth.repository.UserRepository;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class CheckerAccountService {

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordEncoder passwordEncoder;

    public CheckerAccountService(
            UserRepository userRepository,
            RefreshTokenRepository refreshTokenRepository,
            PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional(readOnly = true)
    public List<CheckerAccountResponse> list() {
        return userRepository.findAllByRoleOrderByCreatedAtDesc(UserRole.CHECKER)
                .stream()
                .map(CheckerAccountResponse::from)
                .toList();
    }

    @Transactional
    public CheckerAccountResponse create(CreateCheckerAccountRequest request) {
        String email = normalizeEmail(request.email());
        if (userRepository.existsByEmailIgnoreCase(email)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Email is already registered");
        }
        User checker = userRepository.save(new User(
                UUID.randomUUID(),
                email,
                passwordEncoder.encode(request.password()),
                UserRole.CHECKER,
                Instant.now()));
        return CheckerAccountResponse.from(checker);
    }

    @Transactional
    public void resetPassword(UUID checkerId, String password) {
        User checker = requireChecker(checkerId);
        checker.setPasswordHash(passwordEncoder.encode(password));
        invalidateSessions(checker);
    }

    @Transactional
    public CheckerAccountResponse updateStatus(UUID checkerId, boolean enabled) {
        User checker = requireChecker(checkerId);
        if (checker.isEnabled() != enabled) {
            checker.setEnabled(enabled);
            invalidateSessions(checker);
        }
        return CheckerAccountResponse.from(checker);
    }

    private User requireChecker(UUID checkerId) {
        User checker = userRepository.findById(checkerId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Checker account not found"));
        if (checker.getRole() != UserRole.CHECKER) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Checker account not found");
        }
        return checker;
    }

    private void invalidateSessions(User checker) {
        checker.invalidateSessions();
        refreshTokenRepository.revokeAllForUser(checker.getId());
    }

    private String normalizeEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }
}
