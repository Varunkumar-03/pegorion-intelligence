import type { TowerSite } from './tower-data';
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
export function calculateHealthScore(s: TowerSite): number | null {
  if (s.structuralUtilization === null || s.powerUtilization === null || s.openWorkOrders === null || s.batteryBackupHours === null) return null;
  return clamp(100 - Math.max(0, s.structuralUtilization - 70) * .7 - Math.max(0, s.powerUtilization - 70) * .8 - s.openWorkOrders * 5 - Math.max(0, 4 - s.batteryBackupHours) * 5);
}
export function calculateExpansionScore(s: TowerSite): number | null {
  if (s.structuralUtilization === null || s.availableTenantPositions === null || s.powerUtilization === null || !['High', 'Medium', 'Low'].includes(s.networkDemand)) return null;
  return clamp((100 - s.structuralUtilization) * .5 + s.availableTenantPositions * 10 + (s.networkDemand === 'High' ? 18 : 8) + (100 - s.powerUtilization) * .12);
}
export function calculateColocationScore(s: TowerSite): number | null {
  if (s.structuralUtilization === null || s.powerUtilization === null || s.availableTenantPositions === null || s.backhaulCapacityGbps === null || s.leaseYearsRemaining === null || s.healthScore === null || !['Available', 'Moderate', 'Limited'].includes(s.equipmentSpace)) return null;
  return clamp((100 - s.structuralUtilization) * .25 + (100 - s.powerUtilization) * .2 + (s.availableTenantPositions > 0 ? 18 : 0) +
    (s.equipmentSpace === 'Available' ? 14 : s.equipmentSpace === 'Moderate' ? 8 : 2) + (s.backhaulCapacityGbps >= 2 ? 10 : 3) +
    (s.leaseYearsRemaining >= 5 ? 8 : s.leaseYearsRemaining >= 3 ? 4 : 0) + s.healthScore * .12);
}
export function calculateInvestmentScore(s: TowerSite): number | null {
  if (s.expansionScore === null || s.structuralUtilization === null || s.availableTenantPositions === null || s.potentialRevenue === null || s.futureReadinessScore === null || s.leaseYearsRemaining === null || s.healthScore === null || s.powerUtilization === null) return null;
  return clamp(s.expansionScore * .25 + Math.min(100, (100 - s.structuralUtilization) + s.availableTenantPositions * 20) * .2 +
    Math.min(100, s.potentialRevenue / 1800) * .15 + s.futureReadinessScore * .15 + Math.min(100, s.leaseYearsRemaining / 15 * 100) * .1 + s.healthScore * .1 + (100 - s.powerUtilization) * .05);
}
export function calculateMaintenanceRisk(s: TowerSite): number | null {
  if (s.healthScore === null || s.powerUtilization === null) return null;
  return clamp(100 - s.healthScore + (s.powerUtilization > 80 ? 12 : 0));
}
export function calculateFutureReadinessScore(s: TowerSite): number | null {
  if (s.powerUtilization === null || s.fiberAvailable === null || s.backhaulCapacityGbps === null || s.structuralUtilization === null || s.expansionScore === null || !['Available', 'Moderate', 'Limited'].includes(s.equipmentSpace)) return null;
  return clamp((100 - s.powerUtilization) * .2 + (s.fiberAvailable ? 22 : 8) + Math.min(10, s.backhaulCapacityGbps) * 3 +
    (100 - s.structuralUtilization) * .15 + (s.equipmentSpace === 'Available' ? 16 : s.equipmentSpace === 'Moderate' ? 10 : 5) + s.expansionScore * .18);
}
