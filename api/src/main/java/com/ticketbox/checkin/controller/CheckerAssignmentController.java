package com.ticketbox.checkin.controller;

import com.ticketbox.checkin.dto.CheckerAssignmentAuditRequest;
import com.ticketbox.checkin.dto.CheckerAssignmentsResponse;
import com.ticketbox.checkin.service.CheckerAssignmentService;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/checker")
public class CheckerAssignmentController {

    private final CheckerAssignmentService checkerAssignmentService;

    public CheckerAssignmentController(CheckerAssignmentService checkerAssignmentService) {
        this.checkerAssignmentService = checkerAssignmentService;
    }

    @GetMapping("/assignments")
    CheckerAssignmentsResponse assignments(@RequestParam UUID concertId) {
        return checkerAssignmentService.listForCurrentChecker(concertId);
    }

    @PostMapping("/assignment-audit")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void assignmentAudit(@Valid @RequestBody CheckerAssignmentAuditRequest request) {
        checkerAssignmentService.recordCurrentCheckerAudit(request);
    }
}
