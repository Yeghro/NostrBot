export async function sendMessageToOllama(messages) {
    const body = {
      model: "hAiVbot:latest",
      messages: messages,
      stream: false,
    };
  
    try {
      const response = await fetch("http://localhost:11434/api/chat", {
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
      if (responseData.hasOwnProperty("message") && responseData.message.hasOwnProperty("content")) {
        const replyContent = responseData.message.content;
        console.log("Formatted reply content:", replyContent);
        return { replyContent };
      } else {
        console.error("Unexpected response structure from Ollama API:", responseData);
        return { replyContent: "No response generated." };
      }
    } catch (error) {
      console.error("Failed to send message to Ollama API:", error);
      throw error;
    }
  }