package com.ticketbox.notification;

import jakarta.mail.internet.MimeMessage;
import java.util.Base64;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;

@Component
public class EmailNotificationChannel implements NotificationChannel {

    private static final int MAX_ATTEMPTS = 3;

    private final JavaMailSender mailSender;

    public EmailNotificationChannel(JavaMailSender mailSender) {
        this.mailSender = mailSender;
    }

    @Override
    public void send(NotificationEvent event) {
        RuntimeException lastFailure = null;
        for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                sendOnce(event);
                return;
            } catch (RuntimeException ex) {
                lastFailure = ex;
                sleepBeforeRetry(attempt);
            } catch (Exception ex) {
                lastFailure = new IllegalStateException("Email notification failed", ex);
                sleepBeforeRetry(attempt);
            }
        }
        throw lastFailure == null ? new IllegalStateException("Email notification failed") : lastFailure;
    }

    private void sendOnce(NotificationEvent event) throws Exception {
        MimeMessage message = mailSender.createMimeMessage();
        MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
        helper.setTo(event.recipientEmail());
        helper.setSubject(event.title());
        helper.setText(emailBody(event), false);
        for (NotificationEvent.Attachment attachment : event.attachments()) {
            helper.addAttachment(
                    attachment.fileName(),
                    new ByteArrayResource(Base64.getDecoder().decode(attachment.base64Content())),
                    attachment.contentType());
        }
        mailSender.send(message);
    }

    private String emailBody(NotificationEvent event) {
        String link = event.deepLink() == null || event.deepLink().isBlank()
                ? ""
                : "\n\nOpen: " + event.deepLink();
        return event.body() + link;
    }

    private void sleepBeforeRetry(int attempt) {
        if (attempt >= MAX_ATTEMPTS) {
            return;
        }
        try {
            Thread.sleep(100L * (1L << (attempt - 1)));
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted while retrying email notification", ex);
        }
    }
}
