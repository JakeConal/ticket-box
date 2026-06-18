package com.ticketbox.vip;

import java.nio.file.Path;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "ticketbox.imports")
public class VipImportProperties {

    private Path vipDir = Path.of("./imports/vip");

    public Path getVipDir() {
        return vipDir;
    }

    public void setVipDir(Path vipDir) {
        this.vipDir = vipDir;
    }
}
