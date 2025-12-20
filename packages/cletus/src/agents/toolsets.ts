import type { CletusAI } from '../ai';
import { createArchitectTools } from '../tools/architect';
import { createArtistTools } from '../tools/artist';
import { createClerkTools } from '../tools/clerk';
import { createDBATools } from '../tools/dba';
import { createInternetTools } from '../tools/internet';
import { createLibrarianTools } from '../tools/librarian';
import { createPlannerTools } from '../tools/planner';
import { createSecretaryTools } from '../tools/secretary';
import { createUtilityTools } from '../tools/utility';


/**
 * Create all toolsets and return the tools and factory functions
 */
export function createToolsets(ai: CletusAI) {
  const plannerTools = createPlannerTools(ai);
  const librarianTools = createLibrarianTools(ai);
  const clerkTools = createClerkTools(ai);
  const secretaryTools = createSecretaryTools(ai);
  const architectTools = createArchitectTools(ai);
  const artistTools = createArtistTools(ai);
  const internetTools = createInternetTools(ai);
  const dbaTools = createDBATools(ai);
  const utilityTools = createUtilityTools(ai);

  return {
    plannerTools,
    librarianTools,
    clerkTools,
    secretaryTools,
    architectTools,
    artistTools,
    internetTools,
    dbaTools,
    utilityTools,
  };
}
