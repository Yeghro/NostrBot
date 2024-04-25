export async function sendMessageToOllama(messages) {
    const body = {
      model: "yeghro/sofs",
      prompt: messages.map(msg => msg.content).join(" "),
      stream: false
    };
  
    try {
      const response = await fetch("http://localhost:11434/api/generate", {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
  
      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }
  
      const responseData = await response.json();
      console.log("Full Ollama API Response:", JSON.stringify(responseData, null, 2));
  
      // Check if the response has the expected structure
      if (responseData.hasOwnProperty("response")) {
        const replyContent = responseData.response;
        console.log("Formatted reply content:", replyContent);
        return replyContent;
      } else {
        console.error("Unexpected response structure from Ollama API:", responseData);
        return "No response generated.";
      }
    } catch (error) {
      console.error("Failed to send message to Ollama API:", error);
      throw error;
    }
  }
  