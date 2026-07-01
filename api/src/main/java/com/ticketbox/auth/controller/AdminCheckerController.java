package com.ticketbox.auth.controller;

import com.ticketbox.auth.dto.CheckerAccountResponse;
import com.ticketbox.auth.dto.CreateCheckerAccountRequest;
import com.ticketbox.auth.dto.ResetCheckerPasswordRequest;
import com.ticketbox.auth.dto.UpdateCheckerStatusRequest;
import com.ticketbox.auth.service.CheckerAccountService;
import com.ticketbox.checkin.dto.CheckerAssignmentResponse;
import com.ticketbox.checkin.service.CheckerAssignmentService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/checkers")
public class AdminCheckerController {

    private final CheckerAccountService checkerAccountService;
    private final CheckerAssignmentService checkerAssignmentService;

    public AdminCheckerController(
            CheckerAccountService checkerAccountService,
            CheckerAssignmentService checkerAssignmentService) {
        this.checkerAccountService = checkerAccountService;
        this.checkerAssignmentService = checkerAssignmentService;
    }

    @GetMapping
    List<CheckerAccountResponse> list() {
        return checkerAccountService.list();
    }

    @GetMapping("/{id}/assignments")
    List<CheckerAssignmentResponse> assignments(@PathVariable UUID id) {
        return checkerAssignmentService.listForOrganizer(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    CheckerAccountResponse create(@Valid @RequestBody CreateCheckerAccountRequest request) {
        return checkerAccountService.create(request);
    }

    @PutMapping("/{id}/password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void resetPassword(
            @PathVariable UUID id,
            @Valid @RequestBody ResetCheckerPasswordRequest request) {
        checkerAccountService.resetPassword(id, request.password());
    }

    @PutMapping("/{id}/status")
    CheckerAccountResponse updateStatus(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateCheckerStatusRequest request) {
        return checkerAccountService.updateStatus(id, request.enabled());
    }
}
