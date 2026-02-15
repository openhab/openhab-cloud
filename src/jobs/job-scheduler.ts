/*
 * Copyright (c) 2010-2026 Contributors to the openHAB project
 *
 * See the NOTICE file(s) distributed with this work for additional
 * information.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0
 *
 * SPDX-License-Identifier: EPL-2.0
 */

import { CronJob } from 'cron';
import type { BaseJob } from './base-job';
import type { ILogger } from '../types/notification';

/**
 * Scheduled job entry
 */
interface ScheduledJob {
  job: BaseJob;
  cronJob: CronJob;
}

/**
 * Job scheduler that manages cron-based job execution
 */
export class JobScheduler {
  private readonly jobs: Map<string, ScheduledJob> = new Map();
  private readonly logger: ILogger;

  constructor(logger: ILogger) {
    this.logger = logger;
  }

  /**
   * Register a job to be run on its schedule
   */
  register(job: BaseJob): void {
    if (this.jobs.has(job.name)) {
      throw new Error(`Job ${job.name} is already registered`);
    }

    const cronJob = CronJob.from({
      cronTime: job.schedule,
      onTick: async () => {
        try {
          await job.run();
        } catch (error) {
          this.logger.error(`Unhandled error in job ${job.name}:`, error);
        }
      },
      start: false,
    });

    this.jobs.set(job.name, { job, cronJob });
    this.logger.info(`Registered job: ${job.name} with schedule: ${job.schedule}`);
  }

  /**
   * Start all registered jobs
   */
  startAll(): void {
    for (const [name, { cronJob }] of this.jobs) {
      cronJob.start();
      this.logger.info(`Started job: ${name}`);
    }
  }

  /**
   * Stop all registered jobs
   */
  stopAll(): void {
    for (const [name, { cronJob }] of this.jobs) {
      cronJob.stop();
      this.logger.info(`Stopped job: ${name}`);
    }
  }

}
