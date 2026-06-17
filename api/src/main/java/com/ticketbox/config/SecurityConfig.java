package com.ticketbox.config;

import com.ticketbox.auth.AuthProperties;
import com.ticketbox.auth.security.JwtAuthenticationFilter;
import com.ticketbox.auth.security.TicketBoxUserDetailsService;
import com.ticketbox.ticket.qr.QrProperties;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.AuthorizationFilter;

@Configuration
@EnableMethodSecurity
@EnableConfigurationProperties({AuthProperties.class, QrProperties.class})
public class SecurityConfig {

    @Bean
    SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            JwtAuthenticationFilter jwtAuthenticationFilter,
            DaoAuthenticationProvider authenticationProvider) throws Exception {
        return http
                .csrf(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint((request, response, authException) ->
                                response.setStatus(HttpServletResponse.SC_UNAUTHORIZED))
                        .accessDeniedHandler((request, response, accessDeniedException) ->
                                response.setStatus(HttpServletResponse.SC_FORBIDDEN)))
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers("/error", "/api/health", "/actuator/health", "/actuator/info").permitAll()
                        .requestMatchers("/api/auth/register", "/api/auth/login", "/api/auth/refresh").permitAll()
                        .requestMatchers(
                                "/api/payments/vnpay/callback",
                                "/api/payments/vnpay/ipn",
                                "/api/payments/momo/callback").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/concerts", "/api/concerts/*", "/api/concerts/*/availability").permitAll()
                        .requestMatchers("/api/admin/**").hasRole("ORGANIZER")
                        .requestMatchers("/api/checker/**", "/api/checkins/**", "/api/vip-guests/**").hasRole("CHECKER")
                        .requestMatchers("/api/queue/**", "/api/tickets/purchase", "/api/orders/**")
                                .hasAnyRole("AUDIENCE", "ORGANIZER")
                        .anyRequest().authenticated())
                .authenticationProvider(authenticationProvider)
                .addFilterBefore(jwtAuthenticationFilter, AuthorizationFilter.class)
                .build();
    }

    @Bean
    DaoAuthenticationProvider authenticationProvider(
            TicketBoxUserDetailsService userDetailsService,
            PasswordEncoder passwordEncoder) {
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider(userDetailsService);
        provider.setPasswordEncoder(passwordEncoder);
        return provider;
    }

    @Bean
    AuthenticationManager authenticationManager(DaoAuthenticationProvider authenticationProvider) {
        return new ProviderManager(authenticationProvider);
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
