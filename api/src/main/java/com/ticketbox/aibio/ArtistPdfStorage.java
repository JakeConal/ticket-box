package com.ticketbox.aibio;

import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class ArtistPdfStorage {

    private final ArtistBioProperties properties;

    public ArtistPdfStorage(ArtistBioProperties properties) {
        this.properties = properties;
    }

    public String store(UUID concertId, long generationId, byte[] content) {
        try {
            Files.createDirectories(properties.getStorageDir());
            Path target = properties.getStorageDir()
                    .resolve(concertId + "-" + generationId + ".pdf")
                    .normalize();
            Files.write(target, content);
            return target.toUri().toString();
        } catch (IOException ex) {
            throw new IllegalStateException("Could not store artist PDF", ex);
        }
    }

    public Path pathFor(String uri) {
        return Path.of(URI.create(uri));
    }
}
