# Snake Game Leaderboard - Participant Guide

## Live Leaderboard

Open `leaderboard_viewer.html` in your browser to see real-time scores.

---

## API Reference

### Submit Score

**PUT** to `/leaderboard/{PlayerName}.json`

```bash
curl -X PUT "https://leaderboard-5d2f6-default-rtdb.europe-west1.firebasedatabase.app/leaderboard/YourName.json" \
  -H "Content-Type: application/json" \
  -d '{"score":123,"timestamp":1733679228,"difficulty":"ASCII","language":"C++"}'
```

**JSON body:**
```json
{
  "score": 123,
  "timestamp": 1733679228,
  "difficulty": "ASCII",
  "language": "C++"
}
```

| Field | Type | Description |
|-------|------|-------------|
| score | number | Score value (0 or higher) |
| timestamp | number | Unix timestamp in seconds |
| difficulty | string | One of: `"ASCII"`, `"2D"`, `"3D"` |
| language | string | Programming language used (e.g. `"C++"`, `"Python"`, `"Rust"`) |

**Note:** Player name is in the URL path, not in the JSON body.

**Get current timestamp:**
- C++: `std::time(nullptr)`
- Bash: `$(date +%s)`

### Read Scores

**GET** all scores:
```bash
curl "https://leaderboard-5d2f6-default-rtdb.europe-west1.firebasedatabase.app/leaderboard.json"
```

**GET** top 10 scores (sorted):
```bash
curl "https://leaderboard-5d2f6-default-rtdb.europe-west1.firebasedatabase.app/leaderboard.json?orderBy=\"score\"&limitToLast=10"
```

---

## C++ Example

```cpp
#include <curl/curl.h>
#include <ctime>
#include <string>

void submitScore(const std::string& name, int score) {
    CURL* curl = curl_easy_init();
    if (!curl) return;

    // URL-encode the player name
    char* encodedName = curl_easy_escape(curl, name.c_str(), name.length());
    std::string url = "https://leaderboard-5d2f6-default-rtdb.europe-west1.firebasedatabase.app/leaderboard/"
                    + std::string(encodedName) + ".json";
    curl_free(encodedName);

    // JSON body
    std::string json = "{\"score\":" + std::to_string(score) +
                       ",\"timestamp\":" + std::to_string(std::time(nullptr)) +
                       ",\"difficulty\":\"ASCII\""
                       ",\"language\":\"C++\"}";

    curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
    curl_easy_setopt(curl, CURLOPT_CUSTOMREQUEST, "PUT");
    curl_easy_setopt(curl, CURLOPT_POSTFIELDS, json.c_str());

    struct curl_slist* headers = curl_slist_append(NULL, "Content-Type: application/json");
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);

    curl_easy_perform(curl);
    curl_slist_free_all(headers);
    curl_easy_cleanup(curl);
}
```

**Compile with:**
```bash
g++ -std=c++17 -o snake snake.cpp -lcurl
```

---

## Quick Test

Test that the API works:

```bash
# Submit a test score
curl -X PUT "https://leaderboard-5d2f6-default-rtdb.europe-west1.firebasedatabase.app/leaderboard/TestPlayer.jso… \
  -H "Content-Type: application/json" \
  -d "{\"score\":42,\"timestamp\":$(date +%s),\"difficulty\":\"ASCII\",\"language\":\"C++\"}"

# View all scores
curl "https://leaderboard-5d2f6-default-rtdb.europe-west1.firebasedatabase.app/leaderboard.json"
```

---

## How It Works

- Each player can only have **one entry** on the leaderboard
- Your score is only updated if the new score is **higher** than your current score
- This means only your **best score** appears on the leaderboard

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Permission denied" | Check the URL is correct |
| Score not updating | New score must be higher than existing score |
| Network error | Test URL in browser first |

---

**Good luck with the Snake Game!**