<?php

// DatabaseTruncation y no RefreshDatabase: el Outbox debe ver que no hay transacción abierta.

use Illuminate\Foundation\Testing\DatabaseTruncation;
use Tests\TestCase;

pest()->extend(TestCase::class)->use(DatabaseTruncation::class)->in('Feature');
