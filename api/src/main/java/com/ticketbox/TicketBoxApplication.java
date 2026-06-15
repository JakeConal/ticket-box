package com.ticketbox;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@EnableScheduling
@SpringBootApplication
public class TicketBoxApplication {

    public static void main(String[] args) {
        SpringApplication.run(TicketBoxApplication.class, args);
    }
}
