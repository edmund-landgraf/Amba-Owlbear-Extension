export const DEV_SMOKE_MODULE_ID = "1169543d-450f-4e3f-a02d-0aa6a973db51";
export const DEV_SMOKE_ENCOUNTER_ID = "b326cf5d-c3db-41ac-8558-78b1bb17371b";

export function devSmokeEncounters(moduleId) {
  if (moduleId !== DEV_SMOKE_MODULE_ID) return null;

  return [
    {
      id: DEV_SMOKE_ENCOUNTER_ID,
      moduleId,
      title: "Encounter B - Smoke Room Export",
      map: {
        id: "69de7295-fc11-4963-9cc6-24776bd9a9fc",
        title: "Smoke Test Map",
        url: "/uploads/1169543d-450f-4e3f-a02d-0aa6a973db51/1786804313136-252201653.png",
        grid: {
          cellSize: 256,
          columns: 2,
          rows: 2,
          scale: "5 ft",
        },
      },
      monsterBlocks: [
        {
          id: "6e36d449-b741-4368-b341-87d140362cb8",
          artifactId: "6e36d449-b741-4368-b341-87d140362cb8",
          name: "Goblin Warrior",
          title: "Goblin Warrior",
          quantity: 2,
          level: 1,
          source: "AMBA smoke fixture",
          statBlock:
            "Goblin Warrior (Level 1). Perception +5; AC 16; HP 18. Shortsword +8, agile, finesse. This compact smoke stat block is used to verify Owlbear note/card export.",
        },
        {
          id: "f2948447-232d-42a9-ae6c-2ae6ea752fa6",
          artifactId: "f2948447-232d-42a9-ae6c-2ae6ea752fa6",
          name: "Giant Rat",
          title: "Giant Rat",
          quantity: 1,
          level: 0,
          source: "AMBA smoke fixture",
          statBlock:
            "Giant Rat (Level 0). Perception +5; AC 15; HP 8. Jaws +7. This compact smoke stat block verifies a second creature label family.",
        },
      ],
    },
  ];
}

export function devSmokeEncounter(moduleId, encounterId) {
  return devSmokeEncounters(moduleId)?.find((encounter) => encounter.id === encounterId) ?? null;
}
