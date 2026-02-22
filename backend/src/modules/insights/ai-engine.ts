import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../../shared/config/index.js';
import { logger } from '../../shared/utils/logger.js';
import type { ContributionData, InsightReport } from '../../shared/types/index.js';
import { z } from 'zod';

// Zod schema for validating AI responses
const InsightReportSchema = z.object({
  trends: z.array(z.object({
    type: z.enum(['growth', 'decline']),
    project: z.string(),
    description: z.string(),
    severity: z.enum(['info', 'warning', 'critical']),
  })),
  opportunities: z.array(z.object({
    project: z.string(),
    opportunity: z.string(),
    effort: z.enum(['low', 'medium', 'high']),
    impact: z.enum(['low', 'medium', 'high']),
  })),
  anomalies: z.array(z.object({
    project: z.string(),
    description: z.string(),
    severity: z.enum(['warning', 'critical']),
  })),
  recommendations: z.array(z.object({
    title: z.string(),
    description: z.string(),
    priority: z.enum(['low', 'medium', 'high']),
  })),
});

const INSIGHTS_SYSTEM_PROMPT = `You are an open source strategy analyst for Red Hat AI Organization.

Analyze contribution data from upstream open source projects and provide:
1. Key trends (growing/declining contributions)
2. Strategic opportunities (where to gain maintainer status, underinvested projects)
3. Anomalies requiring attention (sudden drops, new competitors)
4. Actionable recommendations for leadership

Output must be structured JSON matching this schema:
{
  "trends": [{ "type": "growth|decline", "project": "name", "description": "...", "severity": "info|warning|critical" }],
  "opportunities": [{ "project": "name", "opportunity": "...", "effort": "low|medium|high", "impact": "low|medium|high" }],
  "anomalies": [{ "project": "name", "description": "...", "severity": "warning|critical" }],
  "recommendations": [{ "title": "...", "description": "...", "priority": "low|medium|high" }]
}

Return ONLY the JSON object, no additional text or markdown formatting.`;

export class AIInsightsEngine {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor(apiKey?: string) {
    this.genAI = new GoogleGenerativeAI(apiKey || config.googleAIApiKey);
    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-1.5-pro',
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
      } as any,
    });
  }

  /**
   * Generate insights from contribution data
   */
  async generateInsights(
    data: ContributionData[],
    timeRange: { start: Date; end: Date }
  ): Promise<InsightReport> {
    logger.info('Generating AI insights', {
      projectCount: data.length,
      timeRange,
    });

    try {
      const prompt = this.buildInsightPrompt(data, timeRange);
      const fullPrompt = `${INSIGHTS_SYSTEM_PROMPT}\n\n${prompt}`;

      const result = await this.model.generateContent(fullPrompt);
      const response = await result.response;
      const text = response.text();

      logger.debug('Raw AI response', { text: text.substring(0, 200) });

      // Parse and validate JSON response
      const insights = this.parseInsightsResponse(text);

      logger.info('AI insights generated successfully', {
        trends: insights.trends.length,
        opportunities: insights.opportunities.length,
        anomalies: insights.anomalies.length,
        recommendations: insights.recommendations.length,
      });

      return insights;

    } catch (error) {
      logger.error('Error generating AI insights', { error });
      throw error;
    }
  }

  /**
   * Build the prompt for AI insight generation
   */
  private buildInsightPrompt(
    data: ContributionData[],
    timeRange: { start: Date; end: Date }
  ): string {
    const startDate = timeRange.start.toISOString().split('T')[0];
    const endDate = timeRange.end.toISOString().split('T')[0];

    const projectSummaries = data.map(d => `
Project: ${d.projectName} (${d.ecosystem})
- Total Contributions: ${d.totalContributions}
- Red Hat Contributions: ${d.redhatContributions} (${d.contributionPercentage.toFixed(1)}%)
- Red Hat Maintainers: ${d.redhatMaintainers}/${d.totalMaintainers}
- Trend vs Previous Period: ${d.trendPercentage > 0 ? '+' : ''}${d.trendPercentage.toFixed(1)}%
- Active Red Hat Contributors: ${d.activeContributors}
`).join('\n');

    return `Analyze the following contribution data for Red Hat AI Organization across upstream open source projects.

Time Range: ${startDate} to ${endDate}

Projects Data:
${projectSummaries}

Provide strategic insights following the JSON schema defined in the system prompt.`;
  }

  /**
   * Parse and validate AI response
   */
  private parseInsightsResponse(text: string): InsightReport {
    try {
      // Extract JSON from response (handle markdown code blocks if present)
      let jsonText = text.trim();

      // Remove markdown code blocks if present
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.slice(7, -3).trim();
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.slice(3, -3).trim();
      }

      // Parse JSON
      const parsed = JSON.parse(jsonText);

      // Validate with Zod schema
      const validated = InsightReportSchema.parse(parsed);

      return validated;

    } catch (error) {
      logger.error('Error parsing AI insights response', {
        error,
        responsePreview: text.substring(0, 500),
      });

      // Return empty insights on parse failure
      return {
        trends: [],
        opportunities: [],
        anomalies: [],
        recommendations: [{
          title: 'AI Insight Generation Failed',
          description: 'Unable to parse AI response. Please check logs for details.',
          priority: 'low',
        }],
      };
    }
  }

  /**
   * Generate insights for a single project
   */
  async generateProjectInsights(
    projectData: ContributionData,
    timeRange: { start: Date; end: Date }
  ): Promise<string> {
    logger.info(`Generating project-specific insights for ${projectData.projectName}`);

    const prompt = `Analyze the following contribution data for ${projectData.projectName} in the ${projectData.ecosystem} ecosystem.

Time Range: ${timeRange.start.toISOString().split('T')[0]} to ${timeRange.end.toISOString().split('T')[0]}

Data:
- Total Contributions: ${projectData.totalContributions}
- Red Hat Contributions: ${projectData.redhatContributions} (${projectData.contributionPercentage.toFixed(1)}%)
- Red Hat Maintainers: ${projectData.redhatMaintainers} out of ${projectData.totalMaintainers} total
- Trend: ${projectData.trendPercentage > 0 ? '+' : ''}${projectData.trendPercentage.toFixed(1)}%
- Active Contributors: ${projectData.activeContributors}

Provide a concise analysis (2-3 sentences) about Red Hat AI's presence in this project, including strengths, weaknesses, and strategic recommendations.`;

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      return response.text();

    } catch (error) {
      logger.error('Error generating project insights', { error, project: projectData.projectName });
      return 'Unable to generate insights for this project.';
    }
  }

  /**
   * Detect anomalies in contribution patterns
   */
  async detectAnomalies(
    historicalData: Array<{ date: Date; value: number }>,
    projectName: string
  ): Promise<Array<{ date: Date; description: string; severity: 'warning' | 'critical' }>> {
    // Calculate basic statistics
    const values = historicalData.map(d => d.value);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const stdDev = Math.sqrt(
      values.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / values.length
    );

    const anomalies: Array<{ date: Date; description: string; severity: 'warning' | 'critical' }> = [];

    // Detect outliers (values beyond 2 standard deviations)
    for (const dataPoint of historicalData) {
      const zScore = Math.abs((dataPoint.value - mean) / stdDev);

      if (zScore > 2) {
        const severity = zScore > 3 ? 'critical' : 'warning';
        const description = dataPoint.value < mean
          ? `Unusually low contribution activity detected in ${projectName}`
          : `Unusually high contribution activity detected in ${projectName}`;

        anomalies.push({
          date: dataPoint.date,
          description,
          severity,
        });
      }
    }

    return anomalies;
  }
}
