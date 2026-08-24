This is an existing, completed project. I want to use this project to prepare for software engineering interviews.

Do NOT focus mainly on rebuilding, refactoring, or adding features. Instead, inspect the existing codebase and use it as the foundation for a **deep technical interview simulation**.

Act like a strict interviewer who assumes I may have implemented the project but wants to verify whether I actually understand the underlying engineering concepts.

Start from the project and continuously drill down into the technical details.

For example, if the project uses Spring Boot, don't just ask "Why Spring Boot?" Ask follow-up questions such as how dependency injection works internally, how Spring manages beans, bean scopes, the application lifecycle, proxies, AOP, transactions, transaction propagation, isolation levels, lazy loading, Hibernate persistence context, and what happens internally when an HTTP request reaches a controller.

If the project uses PostgreSQL, ask deeply about indexing, B-tree indexes, query planning, joins, transactions, MVCC, isolation levels, locking, deadlocks, constraints, normalization, connection pools, and how the database behaves under concurrent booking requests.

If the project has authentication, drill into password hashing, JWT structure, authentication vs authorization, token validation, refresh tokens, stateless authentication, filters/interceptors, CSRF, CORS, and common security vulnerabilities.

If the project has REST APIs, drill into HTTP semantics, idempotency, status codes, validation, exception handling, pagination, concurrency, API design, and failure scenarios.

If the project uses Docker, Kubernetes, CI/CD, Redis, Kafka, AWS, or other infrastructure, deeply question the underlying concepts rather than only asking how I configured them.

Pay particular attention to the ticket-booking domain. Challenge me with realistic concurrency and system-design scenarios such as multiple users attempting to purchase the same ticket simultaneously, race conditions, overselling, database locking, optimistic vs pessimistic locking, transaction boundaries, idempotency, payment failure, retries, distributed systems, consistency, caching, and horizontal scaling.

Use the actual implementation to determine what questions are relevant. Never assume that I implemented something that does not exist.

The interview style should be:

**Question → wait for my answer → evaluate my answer → identify gaps/mistakes → ask a deeper follow-up question.**

Do not give me the answer immediately unless I explicitly ask for it.

Frequently challenge statements I make with questions like:

* "Why?"
* "How does that work internally?"
* "What happens at runtime?"
* "What happens under concurrent requests?"
* "What happens if this component fails?"
* "What alternative approaches exist?"
* "What are the trade-offs?"
* "Why did you choose this instead of X?"
* "Can you explain what happens step by step?"
* "How would you prove that this works?"
* "What is happening at the database/JVM/network level?"

The goal is not to memorize the project. The goal is to make me understand the **fundamental engineering concepts behind every important technology and design decision used in the project**, so that I can survive aggressive follow-up questions from an interviewer.

Be strict. If my answer is vague, incomplete, technically incorrect, or sounds memorized, point it out and drill deeper.
