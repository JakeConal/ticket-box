package com.ticketbox.aibio;

import java.nio.file.Path;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "ticketbox.ai")
public class ArtistBioProperties {

    private String geminiApiKey = "";
    private String geminiModel = "gemini-2.0-flash";
    private Path storageDir = Path.of("./storage/artist-pdfs");
    private long maxPdfBytes = 20L * 1024L * 1024L;
    private int maxPages = 20;
    private int maxExtractedChars = 40_000;
    private int maxPromptChars = 20_000;
    private int minExtractedChars = 50;
    private Duration extractionTimeout = Duration.ofSeconds(10);
    private Duration reaperThreshold = Duration.ofMinutes(5);
    private Duration regenerationMinInterval = Duration.ofMinutes(1);

    public String getGeminiApiKey() {
        return geminiApiKey;
    }

    public void setGeminiApiKey(String geminiApiKey) {
        this.geminiApiKey = geminiApiKey;
    }

    public String getGeminiModel() {
        return geminiModel;
    }

    public void setGeminiModel(String geminiModel) {
        this.geminiModel = geminiModel;
    }

    public Path getStorageDir() {
        return storageDir;
    }

    public void setStorageDir(Path storageDir) {
        this.storageDir = storageDir;
    }

    public long getMaxPdfBytes() {
        return maxPdfBytes;
    }

    public void setMaxPdfBytes(long maxPdfBytes) {
        this.maxPdfBytes = maxPdfBytes;
    }

    public int getMaxPages() {
        return maxPages;
    }

    public void setMaxPages(int maxPages) {
        this.maxPages = maxPages;
    }

    public int getMaxExtractedChars() {
        return maxExtractedChars;
    }

    public void setMaxExtractedChars(int maxExtractedChars) {
        this.maxExtractedChars = maxExtractedChars;
    }

    public int getMaxPromptChars() {
        return maxPromptChars;
    }

    public void setMaxPromptChars(int maxPromptChars) {
        this.maxPromptChars = maxPromptChars;
    }

    public int getMinExtractedChars() {
        return minExtractedChars;
    }

    public void setMinExtractedChars(int minExtractedChars) {
        this.minExtractedChars = minExtractedChars;
    }

    public Duration getExtractionTimeout() {
        return extractionTimeout;
    }

    public void setExtractionTimeout(Duration extractionTimeout) {
        this.extractionTimeout = extractionTimeout;
    }

    public Duration getReaperThreshold() {
        return reaperThreshold;
    }

    public void setReaperThreshold(Duration reaperThreshold) {
        this.reaperThreshold = reaperThreshold;
    }

    public Duration getRegenerationMinInterval() {
        return regenerationMinInterval;
    }

    public void setRegenerationMinInterval(Duration regenerationMinInterval) {
        this.regenerationMinInterval = regenerationMinInterval;
    }
}
