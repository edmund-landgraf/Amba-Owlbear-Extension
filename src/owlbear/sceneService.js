import OBR from "@owlbear-rodeo/sdk";

export async function isSceneReady() {
    return await OBR.scene.isReady();
}

export async function show(message) {
    await OBR.notification.show(message);
}