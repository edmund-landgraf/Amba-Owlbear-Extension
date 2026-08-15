import { isSceneReady, show } from "./sceneService";

export function wireRoomTest() {

    document
        .getElementById("testRoom")
        .addEventListener("click", async () => {

            if (!(await isSceneReady())) {
                await show("No active scene.");
                return;
            }

            await show("AMBA extension can access this Owlbear scene.");
        });

}
