/**
 * Lambda Function: Generate Policy Recommendations
 * Purpose: AI-driven personalized policy recommendations based on customer profile (Tile 5)
 * Triggers: API Gateway POST /api/policy/recommend
 * Outputs: DynamoDB Recommendations table
 */

const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

const RECOMMENDATIONS_TABLE = process.env.RECOMMENDATIONS_TABLE || 'policy-recommendations';

/**
 * Policy definitions database
 */
const POLICY_CATALOG = [
  {
    id: 'TERM_LIFE_20Y',
    name: 'Term Life Insurance - 20 Year',
    type: 'LIFE',
    basePrice: 25,
    coverage: 500000,
    ageRange: { min: 18, max: 65 },
    features: ['Basic coverage', 'Renewable']
  },
  {
    id: 'WHOLE_LIFE',
    name: 'Whole Life Insurance',
    type: 'LIFE',
    basePrice: 75,
    coverage: 250000,
    ageRange: { min: 18, max: 75 },
    features: ['Lifetime coverage', 'Cash value', 'Fixed premiums']
  },
  {
    id: 'AUTO_BASIC',
    name: 'Auto - Basic Coverage',
    type: 'AUTO',
    basePrice: 65,
    coverage: 100000,
    features: ['Liability', 'Collision', 'Comprehensive']
  },
  {
    id: 'AUTO_PREMIUM',
    name: 'Auto - Premium Coverage',
    type: 'AUTO',
    basePrice: 120,
    coverage: 500000,
    features: ['Higher liability', 'Uninsured motorist', 'Roadside assistance']
  },
  {
    id: 'HEALTH_SILVER',
    name: 'Health - Silver Plan',
    type: 'HEALTH',
    basePrice: 300,
    coverage: 5000,
    features: ['Doctor visits', 'Prescription', 'Emergency']
  },
  {
    id: 'HEALTH_GOLD',
    name: 'Health - Gold Plan',
    type: 'HEALTH',
    basePrice: 550,
    coverage: 10000,
    features: ['Comprehensive', 'Dental', 'Vision', 'Mental health']
  },
  {
    id: 'HOME_BASIC',
    name: 'Home - Basic Coverage',
    type: 'HOME',
    basePrice: 80,
    coverage: 250000,
    features: ['Structure', 'Contents', 'Liability']
  },
  {
    id: 'HOME_FULL',
    name: 'Home - Full Coverage',
    type: 'HOME',
    basePrice: 150,
    coverage: 500000,
    features: ['Full coverage', 'Replacement cost', 'Enhanced liability']
  }
];

/**
 * Main handler
 */
exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const { customerId, applicationId, extractedData, userProfile } = body;

    if (!customerId || !applicationId) {
      return errorResponse(400, 'Missing required parameters');
    }

    // Build risk profile from extracted data
    const riskProfile = buildRiskProfile(extractedData, userProfile);

    // Generate recommendations
    const recommendations = generateRecommendations(riskProfile);

    // Rank recommendations by fit score
    const rankedRecommendations = recommendations
      .map(rec => ({
        ...rec,
        fitScore: calculateFitScore(rec, riskProfile)
      }))
      .sort((a, b) => b.fitScore - a.fitScore)
      .slice(0, 5); // Top 5 recommendations

    // Calculate pricing adjustments based on risk
    const recommendationsWithPricing = rankedRecommendations.map(rec => ({
      ...rec,
      adjustedPrice: calculateAdjustedPrice(rec, riskProfile)
    }));

    // Store recommendations
    const recommendationRecord = {
      recommendationId: `REC-${applicationId}-${Date.now()}`,
      customerId,
      applicationId,
      riskProfile,
      recommendations: recommendationsWithPricing,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
    };

    await dynamodb.put({
      TableName: RECOMMENDATIONS_TABLE,
      Item: recommendationRecord
    }).promise();

    // Log audit event
    await logAuditEvent(customerId, 'POLICY_RECOMMENDATIONS_GENERATED', {
      applicationId,
      recommendationCount: recommendationsWithPricing.length
    });

    return successResponse({
      applicationId,
      riskProfile,
      recommendations: recommendationsWithPricing,
      selectedPolicy: null, // Customer selects during Tile 5
      message: 'Personalized policy recommendations generated'
    });
  } catch (error) {
    console.error('Recommendation error:', error);
    return errorResponse(500, 'Policy recommendation generation failed');
  }
};

/**
 * Build customer risk profile from extracted data
 */
function buildRiskProfile(extractedData, userProfile) {
  return {
    age: calculateAge(userProfile?.dateOfBirth),
    healthStatus: extractedData?.healthStatus || 'UNKNOWN',
    occupation: extractedData?.occupation || 'GENERAL',
    smokerStatus: extractedData?.smoker || false,
    income: extractedData?.income || 'MEDIUM',
    liabilities: extractedData?.existingDebts || 0,
    familySize: userProfile?.familySize || 1,
    riskFactors: identifyRiskFactors(extractedData),
    protectionGaps: identifyProtectionGaps(extractedData)
  };
}

/**
 * Calculate age from date of birth
 */
function calculateAge(dob) {
  if (!dob) return null;
  const today = new Date();
  const birthDate = new Date(dob);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

/**
 * Identify risk factors
 */
function identifyRiskFactors(data) {
  const factors = [];
  
  if (data?.smoker) factors.push('SMOKER');
  if (data?.highRiskOccupation) factors.push('HIGH_RISK_OCCUPATION');
  if (data?.preExistingConditions) factors.push('HEALTH_CONDITIONS');
  if (data?.lowIncome) factors.push('FINANCIAL_RISK');
  if (data?.hazardousActivities) factors.push('HAZARDOUS_ACTIVITIES');
  
  return factors;
}

/**
 * Identify protection gaps
 */
function identifyProtectionGaps(data) {
  const gaps = [];
  
  if (!data?.hasLifeInsurance) gaps.push('LIFE_INSURANCE');
  if (!data?.hasHealthInsurance) gaps.push('HEALTH_INSURANCE');
  if (!data?.hasAutoInsurance) gaps.push('AUTO_INSURANCE');
  if (!data?.hasHomeInsurance) gaps.push('HOME_INSURANCE');
  if (!data?.hasDependents && data?.familySize > 1) gaps.push('DEPENDENT_PROTECTION');
  
  return gaps;
}

/**
 * Generate policy recommendations based on risk profile
 */
function generateRecommendations(riskProfile) {
  const recommendations = [];
  const { age, occupation, healthStatus, smokerStatus, familySize, protectionGaps } = riskProfile;

  // Life Insurance Recommendations
  if (protectionGaps.includes('LIFE_INSURANCE')) {
    if (age < 50 && !smokerStatus) {
      recommendations.push(POLICY_CATALOG.find(p => p.id === 'TERM_LIFE_20Y'));
    } else if (age >= 50 || smokerStatus) {
      recommendations.push(POLICY_CATALOG.find(p => p.id === 'WHOLE_LIFE'));
    }
  }

  // Health Insurance Recommendations
  if (protectionGaps.includes('HEALTH_INSURANCE')) {
    if (healthStatus === 'EXCELLENT') {
      recommendations.push(POLICY_CATALOG.find(p => p.id === 'HEALTH_SILVER'));
    } else {
      recommendations.push(POLICY_CATALOG.find(p => p.id === 'HEALTH_GOLD'));
    }
  }

  // Auto Insurance Recommendations
  if (protectionGaps.includes('AUTO_INSURANCE')) {
    if (occupation === 'HIGH_RISK') {
      recommendations.push(POLICY_CATALOG.find(p => p.id === 'AUTO_PREMIUM'));
    } else {
      recommendations.push(POLICY_CATALOG.find(p => p.id === 'AUTO_BASIC'));
    }
  }

  // Home Insurance Recommendations
  if (protectionGaps.includes('HOME_INSURANCE')) {
    recommendations.push(POLICY_CATALOG.find(p => p.id === 'HOME_FULL'));
  }

  // Filter by eligibility
  return recommendations.filter(rec => {
    if (rec.ageRange) {
      return age >= rec.ageRange.min && age <= rec.ageRange.max;
    }
    return true;
  });
}

/**
 * Calculate fit score (0-100) for recommendation
 */
function calculateFitScore(policy, riskProfile) {
  let score = 70; // Base score

  // Age factor
  if (policy.ageRange) {
    const ageFromMin = riskProfile.age - policy.ageRange.min;
    const ageFromMax = policy.ageRange.max - riskProfile.age;
    const ageFit = Math.min(ageFromMin, ageFromMax) / ((policy.ageRange.max - policy.ageRange.min) / 2);
    score += ageFit * 15;
  }

  // Protection gap bonus
  if (riskProfile.protectionGaps) {
    const gapMatch = riskProfile.protectionGaps.some(gap => 
      policy.type === gap.replace('_INSURANCE', '')
    );
    if (gapMatch) score += 10;
  }

  // Risk factor adjustment
  if (riskProfile.riskFactors.length > 0) {
    score -= riskProfile.riskFactors.length * 3;
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * Calculate adjusted price based on risk profile
 */
function calculateAdjustedPrice(policy, riskProfile) {
  let basePrice = policy.basePrice;
  let multiplier = 1.0;

  // Age adjustment (life insurance)
  if (policy.type === 'LIFE' && riskProfile.age) {
    if (riskProfile.age >= 50) multiplier += 0.3;
    else if (riskProfile.age >= 40) multiplier += 0.15;
  }

  // Smoker adjustment
  if (riskProfile.smokerStatus) {
    multiplier += 0.5;
  }

  // Health adjustment
  if (riskProfile.healthStatus === 'POOR') {
    multiplier += 0.4;
  } else if (riskProfile.healthStatus === 'EXCELLENT') {
    multiplier -= 0.1;
  }

  return Math.round(basePrice * multiplier * 100) / 100;
}

/**
 * Log audit event
 */
async function logAuditEvent(customerId, action, details) {
  await dynamodb.put({
    TableName: process.env.AUDIT_TABLE || 'audit-logs',
    Item: {
      customerId,
      timestamp: new Date().toISOString(),
      action,
      details,
      agent: 'POLICY_RECOMMENDATIONS_LAMBDA'
    }
  }).promise();
}

function successResponse(data) {
  return {
    statusCode: 200,
    body: JSON.stringify(data),
    headers: { 'Content-Type': 'application/json' }
  };
}

function errorResponse(statusCode, message) {
  return {
    statusCode,
    body: JSON.stringify({ error: message }),
    headers: { 'Content-Type': 'application/json' }
  };
}
