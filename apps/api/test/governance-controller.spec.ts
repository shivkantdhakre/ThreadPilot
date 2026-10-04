import { describe, it } from 'node:test';
import assert from 'node:assert';
import { RulesController } from '../dist/governance/rules.controller.js';
import { SafetyController } from '../dist/governance/safety.controller.js';
import { ExperimentsController } from '../dist/governance/experiments.controller.js';
import { OperatorController } from '../dist/governance/operator.controller.js';
import { AdaptationController } from '../dist/governance/adaptation.controller.js';
import { GovernanceService } from '../dist/governance/governance.service.js';

describe('Governance API Controllers & Service Contract Verification', () => {
  const workspaceId = '11111111-1111-1111-1111-111111111111';
  const socialAccountId = '22222222-2222-2222-2222-222222222222';
  const userId = '33333333-3333-3333-3333-333333333333';

  describe('RulesController & GovernanceService Rules Management', () => {
    it('creates an AST policy rule with valid condition tree and discriminated actions', async () => {
      let createdPayload: any = null;
      const mockService: any = {
        createRule: async (wsId: string, accId: string, body: any) => {
          createdPayload = { wsId, accId, ...body };
          return {
            id: 'rule-test-1',
            workspaceId: wsId,
            socialAccountId: accId,
            name: body.name,
            triggerType: body.triggerType,
            astConditions: body.astConditions,
            actions: body.actions,
            priority: body.priority,
            isActive: true,
            createdAt: new Date().toISOString(),
          };
        },
      };

      const controller = new RulesController(mockService);
      const res = await controller.createRule(workspaceId, socialAccountId, {
        name: 'Auto-schedule high engagement posts',
        triggerType: 'POST_PUBLISHED',
        astConditions: {
          type: 'LEAF',
          operator: 'GT',
          field: 'predictedScore',
          value: 0.8,
        },
        actions: [
          {
            actionType: 'AUTO_SCHEDULE',
            parameters: {},
          },
        ],
        priority: 10,
        maxDailyExecutions: 5,
      });

      assert.strictEqual(res.name, 'Auto-schedule high engagement posts');
      assert.strictEqual(res.priority, 10);
      assert.strictEqual(res.isActive, true);
      assert.strictEqual(createdPayload.wsId, workspaceId);
      assert.strictEqual(createdPayload.accId, socialAccountId);
    });

    it('rejects rule creation without required socialAccountId query parameter', async () => {
      const mockService: any = {};
      const controller = new RulesController(mockService);

      await assert.rejects(
        async () => {
          await controller.createRule(workspaceId, '', { name: 'Invalid Rule' });
        },
        /socialAccountId query parameter is required/
      );
    });

    it('lists rules filtered by workspace and toggles active status', async () => {
      let toggleUpdated = false;
      const mockService: any = {
        listRules: async (wsId: string) => [
          { id: 'rule-1', workspaceId: wsId, name: 'Rule 1', isActive: true },
        ],
        updateRule: async (wsId: string, id: string, body: any) => {
          if (id === 'rule-1' && body.isActive === false) {
            toggleUpdated = true;
            return { id, isActive: false };
          }
          return null;
        },
      };

      const controller = new RulesController(mockService);
      const list = await controller.listRules(workspaceId);
      assert.strictEqual(list.length, 1);
      assert.strictEqual(list[0].id, 'rule-1');

      const toggled = await controller.toggleRule(workspaceId, 'rule-1', { isActive: false });
      assert.strictEqual(toggleUpdated, true);
      assert.strictEqual(toggled?.isActive, false);
    });

    it('lists rule execution history across rules or filtered by rule ID', async () => {
      const mockService: any = {
        listRuleExecutions: async (wsId: string, accId?: string, rId?: string, limit?: number) => [
          {
            id: 'exec-1',
            workspaceId: wsId,
            socialAccountId: accId ?? 'acc-default',
            ruleId: rId ?? 'rule-1',
            status: 'EXECUTED',
            executionKey: 'item-100-POST_METRIC_CAPTURED',
            actionExecutions: [{ actionType: 'AUTO_SCHEDULE', status: 'EXECUTED' }],
            rule: { id: rId ?? 'rule-1', name: 'Engagement Booster', triggerType: 'POST_METRIC_CAPTURED' },
          },
        ],
      };

      const controller = new RulesController(mockService);
      const allExecutions = await controller.listAllRuleExecutions(workspaceId, socialAccountId, '20');
      assert.strictEqual(allExecutions.length, 1);
      assert.strictEqual(allExecutions[0].status, 'EXECUTED');
      assert.strictEqual(allExecutions[0].actionExecutions.length, 1);

      const ruleExecutions = await controller.listRuleExecutions(workspaceId, 'rule-1', socialAccountId, '10');
      assert.strictEqual(ruleExecutions.length, 1);
      assert.strictEqual(ruleExecutions[0].ruleId, 'rule-1');
    });

    it('deletes an existing rule by ID within tenant boundary', async () => {
      let deletedId = '';
      const mockService: any = {
        deleteRule: async (wsId: string, id: string) => {
          deletedId = id;
          return { id, deleted: true };
        },
      };

      const controller = new RulesController(mockService);
      const result = await controller.deleteRule(workspaceId, 'rule-to-delete');
      assert.strictEqual(deletedId, 'rule-to-delete');
      assert.strictEqual(result.deleted, true);
    });
  });

  describe('SafetyController & Option A Override Invariants', () => {
    it('lists safety audits with 4-wall evaluation telemetry', async () => {
      const mockService: any = {
        listSafetyAudits: async (wsId: string) => [
          {
            id: 'audit-001',
            workspaceId: wsId,
            status: 'PASSED',
            hallucinationScore: 0.02,
            toxicityScore: 0.01,
            failedWalls: [],
          },
          {
            id: 'audit-002',
            workspaceId: wsId,
            status: 'REJECTED',
            hallucinationScore: 0.72,
            toxicityScore: 0.05,
            failedWalls: ['CLAIM_HALLUCINATION'],
          },
        ],
      };

      const controller = new SafetyController(mockService);
      const audits = await controller.listAudits(workspaceId);
      assert.strictEqual(audits.length, 2);
      assert.strictEqual(audits[0].status, 'PASSED');
      assert.strictEqual(audits[1].failedWalls.includes('CLAIM_HALLUCINATION'), true);
    });

    it('processes Option A single-use safety override with CAS token consumption', async () => {
      let overrideRequested = false;
      const mockService: any = {
        requestSafetyOverride: async (
          wsId: string,
          auditId: string,
          actorId: string,
          data: any
        ) => {
          overrideRequested = true;
          return {
            id: 'override-log-1',
            auditId,
            actorId,
            status: 'OVERRIDDEN',
            reason: data.reason,
            riskAcknowledged: data.riskAcknowledged,
            oneTimeToken: 'cas-token-uuid-1234',
            consumedAt: new Date().toISOString(),
          };
        },
      };

      const controller = new SafetyController(mockService);
      const res = await controller.requestOverride(
        workspaceId,
        { userId, email: 'operator@threadpilot.ai', workspaceId } as any,
        {
          auditId: 'audit-002',
          reason: 'Manual operator confirmation for fast-breaking product announcement',
          riskAcknowledged: true,
        }
      );

      assert.strictEqual(overrideRequested, true);
      assert.strictEqual(res.status, 'OVERRIDDEN');
      assert.ok(res.oneTimeToken);
    });

    it('rejects override request without auditId', async () => {
      const mockService: any = {};
      const controller = new SafetyController(mockService);

      await assert.rejects(
        async () => {
          await controller.requestOverride(
            workspaceId,
            { userId } as any,
            { auditId: '', reason: 'Some reason', riskAcknowledged: true }
          );
        },
        /auditId is required/
      );
    });
  });

  describe('ExperimentsController & Two-Arm Controlled Randomization', () => {
    it('creates strictly two-arm A/B experiment with Control and Treatment variants', async () => {
      let expCreated = false;
      const mockService: any = {
        createExperiment: async (wsId: string, accId: string, body: any) => {
          expCreated = true;
          return {
            id: 'exp-1',
            workspaceId: wsId,
            socialAccountId: accId,
            name: body.name,
            dimension: body.dimension,
            status: 'DRAFT',
            variants: [
              { variantKey: 'A', isControl: true, dimensionValue: body.controlDimensionValue },
              { variantKey: 'B', isControl: false, dimensionValue: body.treatmentDimensionValue },
            ],
          };
        },
      };

      const controller = new ExperimentsController(mockService);
      const res = await controller.createExperiment(workspaceId, socialAccountId, {
        name: 'Opening Hook Style Impact',
        hypothesis: 'Question hooks outperform declarative hooks in replies conversion',
        dimension: 'FORMAT',
        controlDimensionValue: 'DECLARATIVE',
        treatmentDimensionValue: 'QUESTION',
      });

      assert.strictEqual(expCreated, true);
      assert.strictEqual(res.variants.length, 2);
      assert.strictEqual(res.variants[0].isControl, true);
      assert.strictEqual(res.variants[1].isControl, false);
    });

    it('activates DRAFT experiment establishing enrollment and planned analysis horizons', async () => {
      const mockService: any = {
        activateExperiment: async (wsId: string, expId: string) => ({
          id: expId,
          status: 'ACTIVE',
          activatedAt: new Date().toISOString(),
          enrollmentEndAt: new Date(Date.now() + 14 * 86400 * 1000).toISOString(),
          plannedAnalysisAt: new Date(Date.now() + (14 * 86400 + 30 * 3600) * 1000).toISOString(),
        }),
      };

      const controller = new ExperimentsController(mockService);
      const res = await controller.activateExperiment(workspaceId, 'exp-1');

      assert.strictEqual(res.status, 'ACTIVE');
      assert.ok(res.activatedAt);
      assert.ok(res.enrollmentEndAt);
      assert.ok(res.plannedAnalysisAt);
    });
  });

  describe('OperatorController & Autonomous Leasing Telemetry', () => {
    it('returns operator telemetry auto-resolving primary account when omitted', async () => {
      const mockService: any = {
        getOperatorStatus: async (wsId: string, accId?: string) => ({
          config: { autonomyLevel: 'SEMI_AUTONOMOUS', maxWeeklyPosts: 20 },
          isLeaseActive: true,
          latestRuns: [{ id: 'run-1', status: 'COMPLETED', candidatesScheduled: 2 }],
          weeklyQuota: { claimedPosts: 6, maxWeeklyPosts: 20 },
          targetAccountId: accId || socialAccountId,
        }),
      };

      const controller = new OperatorController(mockService);
      const status = await controller.getStatus(workspaceId);

      assert.strictEqual(status.isLeaseActive, true);
      assert.strictEqual(status.config.autonomyLevel, 'SEMI_AUTONOMOUS');
      assert.strictEqual(status.weeklyQuota.claimedPosts, 6);
      assert.strictEqual(status.targetAccountId, socialAccountId);
    });

    it('toggles emergency kill switch pausing background dispatch', async () => {
      let pauseInvoked = false;
      const mockService: any = {
        toggleOperator: async (wsId: string, accId: string, actorId: string, resume: boolean) => {
          pauseInvoked = true;
          return {
            workspaceId: wsId,
            socialAccountId: accId,
            autonomyLevel: resume ? 'SEMI_AUTONOMOUS' : 'PAUSED',
          };
        },
      };

      const controller = new OperatorController(mockService);
      const pausedRes = await controller.toggleOperator(
        workspaceId,
        socialAccountId,
        { userId } as any,
        'false'
      );

      assert.strictEqual(pauseInvoked, true);
      assert.strictEqual(pausedRes.autonomyLevel, 'PAUSED');
    });

    it('updates operator configuration with validated settings', async () => {
      let receivedUpdates: any = null;
      const mockService: any = {
        updateOperatorConfig: async (
          wsId: string,
          accId: string,
          actorId: string,
          updates: any,
        ) => {
          receivedUpdates = updates;
          return {
            workspaceId: wsId,
            socialAccountId: accId,
            ...updates,
          };
        },
      };

      const controller = new OperatorController(mockService);
      const res = await controller.updateConfig(
        workspaceId,
        socialAccountId,
        { userId } as any,
        {
          autonomyLevel: 'FULL_AUTONOMOUS',
          maxWeeklyPosts: 21,
          minHoursBetweenPosts: 6,
          targetPostingHours: [9, 13, 18],
        },
      );

      assert.strictEqual(res.autonomyLevel, 'FULL_AUTONOMOUS');
      assert.strictEqual(res.maxWeeklyPosts, 21);
      assert.strictEqual(res.minHoursBetweenPosts, 6);
      assert.deepStrictEqual(res.targetPostingHours, [9, 13, 18]);
      assert.strictEqual(receivedUpdates.autonomyLevel, 'FULL_AUTONOMOUS');
    });

    it('rejects invalid operator configuration payloads', async () => {
      const mockService: any = {
        updateOperatorConfig: async () => ({}),
      };
      const controller = new OperatorController(mockService);

      await assert.rejects(
        async () => {
          await controller.updateConfig(
            workspaceId,
            socialAccountId,
            { userId } as any,
            {
              autonomyLevel: 'SUPER_HUMAN_UNKNOWN_MODE',
            },
          );
        },
        (err: any) => err.message.includes('Invalid operator config payload'),
      );
    });
  });

  describe('AdaptationController & Profile Adaptation Proposals', () => {
    it('lists adaptation proposals with optional status filter', async () => {
      const mockService: any = {
        listAdaptationProposals: async (wsId: string, accId?: string, status?: string) => [
          {
            id: 'prop-1',
            workspaceId: wsId,
            status: status || 'PENDING_REVIEW',
            dimension: 'TOPIC',
            observedRawLift: 0.18,
          },
        ],
      };

      const controller = new AdaptationController(mockService);
      const res = await controller.listProposals(workspaceId, socialAccountId, 'PENDING_REVIEW' as any);

      assert.strictEqual(res.length, 1);
      assert.strictEqual(res[0].id, 'prop-1');
      assert.strictEqual(res[0].status, 'PENDING_REVIEW');
    });

    it('applies a pending adaptation proposal updating learned weights', async () => {
      let applyInvoked = false;
      const mockService: any = {
        applyAdaptationProposal: async (wsId: string, propId: string, actorId: string) => {
          applyInvoked = true;
          return {
            id: propId,
            status: 'APPLIED',
            appliedAt: new Date(),
          };
        },
      };

      const controller = new AdaptationController(mockService);
      const res = await controller.applyProposal(workspaceId, { userId } as any, 'prop-1');

      assert.strictEqual(applyInvoked, true);
      assert.strictEqual(res.status, 'APPLIED');
    });

    it('rejects an adaptation proposal recording operational reason', async () => {
      let rejectedReason: string | undefined;
      const mockService: any = {
        rejectAdaptationProposal: async (
          wsId: string,
          propId: string,
          actorId: string,
          reason?: string,
        ) => {
          rejectedReason = reason;
          return {
            id: propId,
            status: 'REJECTED',
            rejectionReason: reason,
          };
        },
      };

      const controller = new AdaptationController(mockService);
      const res = await controller.rejectProposal(
        workspaceId,
        { userId } as any,
        'prop-1',
        { reason: 'Topic does not fit brand voice roadmap' },
      );

      assert.strictEqual(res.status, 'REJECTED');
      assert.strictEqual(rejectedReason, 'Topic does not fit brand voice roadmap');
    });
  });
});
