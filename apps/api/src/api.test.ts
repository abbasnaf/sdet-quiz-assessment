import { describe, expect, test } from "bun:test";
const API_URL = "http://localhost:3001";

describe("API Test", () => {
  
  //  Health Check
  test("GET /health, should return system status", async () => {
    const response = await fetch(`${API_URL}/health`);
    expect(response.status).toBe(200);
  });

  // Valid Submission
  test("POST /api/quiz/submit, accept valid submission", async () => {
    const payload = {
      userId: "user1",
      quizId: "quiz123",
      answers: ["A", "C", "B", "D", "A"]
    };

    const response = await fetch(`${API_URL}/api/quiz/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    expect(response.status).toBe(202); 
  });

  // Missing input
  test("POST /api/quiz/submit, 422 Bad Request for missing input", async () => {
    const badPayload = {
      quizId: "quiz123", 
      // missing 'userId' and 'answers'
    };

    const response = await fetch(`${API_URL}/api/quiz/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(badPayload),
    });

    expect(response.status).toBe(422);
  });

  // Leaderboard Data
  test("GET /api/leaderboard, should return correctly structured objects", async () => {
    const response = await fetch(`${API_URL}/api/leaderboard`);
    expect(response.status).toBe(200);

    const body = await response.json();
    
    // Ensure the contract holds: it must be an object
      expect(typeof body).toBe("object");
    
    }
  );
});