using System.Collections;
using System.Collections.Generic;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace ChaosParcel.Gameplay
{
    /// <summary>
    /// Posts final game scores to Supabase Edge Function.
    /// Configure via ServerConfig ScriptableObject (do not commit secrets).
    /// </summary>
    public class SupabaseScoreSaver : MonoBehaviour
    {
        [SerializeField] private ServerConfig config;

        public void SaveResults(List<GameLoopManager.PlayerScore> scores)
        {
            if (config == null || string.IsNullOrEmpty(config.SupabaseUrl))
            {
                Debug.LogWarning("SupabaseScoreSaver: ServerConfig not set.");
                return;
            }

            StartCoroutine(PostResults(scores));
        }

        private IEnumerator PostResults(List<GameLoopManager.PlayerScore> scores)
        {
            var sb = new StringBuilder();
            sb.Append("{\"room_code\":\"\",\"results\":[");
            for (var i = 0; i < scores.Count; i++)
            {
                var s = scores[i];
                if (i > 0) sb.Append(',');
                sb.Append($"{{\"nickname\":\"{EscapeJson(s.nickname)}\",\"score\":{s.totalScore},");
                sb.Append($"\"stats\":{{\"bombs_exploded\":{s.bombsExploded},\"abilities_received\":{s.abilitiesReceived}}}}}");
            }
            sb.Append("]}");

            var url = $"{config.SupabaseUrl.TrimEnd('/')}/functions/v1/save-game-results";
            using var request = new UnityWebRequest(url, "POST");
            var bodyRaw = Encoding.UTF8.GetBytes(sb.ToString());
            request.uploadHandler = new UploadHandlerRaw(bodyRaw);
            request.downloadHandler = new DownloadHandlerBuffer();
            request.SetRequestHeader("Content-Type", "application/json");
            request.SetRequestHeader("Authorization", $"Bearer {config.SupabaseServiceKey}");

            yield return request.SendWebRequest();

            if (request.result != UnityWebRequest.Result.Success)
            {
                Debug.LogError($"Failed to save scores: {request.error}");
            }
            else
            {
                Debug.Log("Scores saved successfully.");
            }
        }

        private static string EscapeJson(string value)
        {
            return value.Replace("\\", "\\\\").Replace("\"", "\\\"");
        }
    }
}
