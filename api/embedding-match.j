export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { myText, list } = req.body;
  if (!myText || !list?.length) return res.status(400).json([]);

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    const texts = [myText, ...list.map(p => p.content)];
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: "text-embedding-3-small", input: texts }),
    });
    const data = await response.json();
    const embeddings = data.data.map(d => d.embedding);
    const myEmb = embeddings[0];

    const scored = list.map((p, i) => {
      const emb = embeddings[i + 1];
      const dot = myEmb.reduce((sum, v, j) => sum + v * emb[j], 0);
      return { ...p, score: dot };
    });

    scored.sort((a, b) => b.score - a.score);
    return res.status(200).json(scored);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}