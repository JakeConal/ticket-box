package com.ticketbox.config;

import java.util.Arrays;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.springframework.beans.BeansException;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.beans.factory.config.BeanFactoryPostProcessor;
import org.springframework.beans.factory.config.ConfigurableListableBeanFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class FlywayConfig {

    @Bean(initMethod = "migrate")
    @ConditionalOnProperty(prefix = "spring.flyway", name = "enabled", havingValue = "true", matchIfMissing = true)
    Flyway flyway(DataSource dataSource) {
        return Flyway.configure()
            .dataSource(dataSource)
            .locations("classpath:db/migration")
            .load();
    }

    @Bean
    @ConditionalOnProperty(prefix = "spring.flyway", name = "enabled", havingValue = "true", matchIfMissing = true)
    static BeanFactoryPostProcessor entityManagerFactoryDependsOnFlyway() {
        return new BeanFactoryPostProcessor() {
            @Override
            public void postProcessBeanFactory(ConfigurableListableBeanFactory beanFactory) throws BeansException {
                if (!beanFactory.containsBeanDefinition("entityManagerFactory")) {
                    return;
                }

                BeanDefinition definition = beanFactory.getBeanDefinition("entityManagerFactory");
                String[] dependsOn = definition.getDependsOn();
                if (dependsOn == null) {
                    definition.setDependsOn("flyway");
                    return;
                }
                if (Arrays.asList(dependsOn).contains("flyway")) {
                    return;
                }

                String[] updated = Arrays.copyOf(dependsOn, dependsOn.length + 1);
                updated[updated.length - 1] = "flyway";
                definition.setDependsOn(updated);
            }
        };
    }
}
