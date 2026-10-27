// Prueba de conexión a Claude a través de Vertex AI (Google Cloud).
// Variables: GOOGLE_CLOUD_PROJECT, CLOUD_ML_REGION, CLAUDE_VERTEX_MODEL y
// GOOGLE_APPLICATION_CREDENTIALS (ruta al JSON de la cuenta de servicio).
import AnthropicVertex from "@anthropic-ai/vertex-sdk";

const modelo = process.env.CLAUDE_VERTEX_MODEL;
if (!modelo) throw new Error("Falta CLAUDE_VERTEX_MODEL en el entorno.");

const client = new AnthropicVertex();

const respuesta = await client.messages.create({
  model: modelo,
  max_tokens: 100,
  messages: [{ role: "user", content: "Responde en una frase: ¿qué es Club Sinergético?" }],
});

console.log(respuesta.content);
console.log("uso:", respuesta.usage);
