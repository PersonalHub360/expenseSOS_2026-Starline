export function refuseProductionDemo(nodeEnv: string) {
  if (nodeEnv === "production") {
    throw new Error("Refusing to load demo data in production.");
  }
}
