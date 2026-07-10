using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using UnityEngine;
using UnityEngine.UI;
using TMPro;

namespace ChaosParcel.Gameplay
{
    /// <summary>
    /// Core game loop: 5 rounds, package assignment, timer, scoring, broadcasts.
    /// </summary>
    public class GameLoopManager : MonoBehaviour
    {
        [SerializeField] private PlayerSpawner spawner;
        [SerializeField] private Transform packageTransform;
        [SerializeField] private Button startButton;
        [SerializeField] private TextMeshProUGUI roundText;
        [SerializeField] private float roundDuration = 30f;
        [SerializeField] private float packageTimerMax = 15f;
        [SerializeField] private int totalRounds = 5;

        private int _currentRound;
        private string _packageHolderId;
        private float _packageTimer;
        private bool _inGame;
        private readonly Dictionary<string, PlayerScore> _scores = new();

        private void Start()
        {
            if (startButton != null)
            {
                startButton.onClick.AddListener(StartGame);
            }
        }

        private void OnEnable()
        {
            if (Network.NetworkManager.Instance != null)
            {
                Network.NetworkManager.Instance.OnRawMessage += HandleMessage;
            }
        }

        private void OnDisable()
        {
            if (Network.NetworkManager.Instance != null)
            {
                Network.NetworkManager.Instance.OnRawMessage -= HandleMessage;
            }
        }

        private void HandleMessage(string json)
        {
            if (json.Contains("PASS_PACKAGE"))
            {
                var data = JsonUtility.FromJson<PassWrapper>(json);
                if (data?.payload != null && data.payload.player_id == _packageHolderId)
                {
                    PassPackage(data.payload.target_player_id);
                }
            }
        }

        public void StartGame()
        {
            if (_inGame) return;
            _inGame = true;
            _currentRound = 0;
            _scores.Clear();

            foreach (var go in spawner.GetAllPlayers())
            {
                var controller = go.GetComponent<PlayerController>();
                if (controller != null)
                {
                    _scores[controller.PlayerId] = new PlayerScore
                    {
                        playerId = controller.PlayerId,
                        nickname = go.name.Replace("Player_", ""),
                    };
                }
            }

            StartCoroutine(RunGame());
        }

        private IEnumerator RunGame()
        {
            while (_currentRound < totalRounds)
            {
                _currentRound++;
                if (roundText != null) roundText.text = $"Round {_currentRound}/{totalRounds}";

                AssignPackageRandom();
                BroadcastGameState();

                var roundTimer = roundDuration;
                while (roundTimer > 0f)
                {
                    roundTimer -= Time.deltaTime;
                    _packageTimer -= Time.deltaTime;

                    UpdateScoreTimers();

                    if (_packageTimer <= 0f)
                    {
                        ExplodePackage();
                        yield return new WaitForSeconds(2f);
                        break;
                    }

                    BroadcastGameState();
                    yield return null;
                }

                EndRound();
                yield return new WaitForSeconds(3f);
            }

            EndGame();
        }

        private void AssignPackageRandom()
        {
            var players = spawner.GetAllPlayers().ToList();
            if (players.Count == 0) return;

            var pick = players[Random.Range(0, players.Count)];
            var controller = pick.GetComponent<PlayerController>();
            _packageHolderId = controller?.PlayerId;
            _packageTimer = packageTimerMax;

            foreach (var go in players)
            {
                var c = go.GetComponent<PlayerController>();
                c?.SetHasPackage(c.PlayerId == _packageHolderId);
            }
        }

        private void PassPackage(string targetPlayerId)
        {
            if (string.IsNullOrEmpty(targetPlayerId))
            {
                var nearest = FindNearestPlayer(_packageHolderId);
                targetPlayerId = nearest;
            }

            if (string.IsNullOrEmpty(targetPlayerId)) return;

            _packageHolderId = targetPlayerId;
            _packageTimer = packageTimerMax;

            foreach (var go in spawner.GetAllPlayers())
            {
                var c = go.GetComponent<PlayerController>();
                c?.SetHasPackage(c.PlayerId == _packageHolderId);
            }
        }

        private string FindNearestPlayer(string fromPlayerId)
        {
            var fromGo = spawner.GetPlayer(fromPlayerId);
            if (fromGo == null) return null;

            string nearest = null;
            var minDist = float.MaxValue;

            foreach (var go in spawner.GetAllPlayers())
            {
                var c = go.GetComponent<PlayerController>();
                if (c == null || c.PlayerId == fromPlayerId) continue;

                var dist = Vector3.Distance(fromGo.transform.position, go.transform.position);
                if (dist < minDist && dist < 2f)
                {
                    minDist = dist;
                    nearest = c.PlayerId;
                }
            }

            return nearest;
        }

        private void ExplodePackage()
        {
            if (_scores.TryGetValue(_packageHolderId, out var score))
            {
                score.roundScore -= 50;
                score.hadExplosion = true;
                score.bombsExploded++;
            }

            AssignPackageRandom();
        }

        private void UpdateScoreTimers()
        {
            foreach (var go in spawner.GetAllPlayers())
            {
                var c = go.GetComponent<PlayerController>();
                if (c == null || !_scores.ContainsKey(c.PlayerId)) continue;

                if (c.PlayerId != _packageHolderId)
                {
                    _scores[c.PlayerId].timeWithoutPackage += Time.deltaTime;
                }
            }
        }

        private void EndRound()
        {
            string survivor = null;
            var minExplosions = int.MaxValue;

            foreach (var kv in _scores)
            {
                var roundScore = Mathf.RoundToInt(kv.Value.timeWithoutPackage);
                if (!kv.Value.hadExplosion)
                {
                    roundScore += 100;
                    survivor = kv.Key;
                }
                if (kv.Value.hadExplosion) roundScore -= 50;

                kv.Value.roundScore = roundScore;
                kv.Value.totalScore += roundScore;
                kv.Value.hadExplosion = false;
                kv.Value.timeWithoutPackage = 0f;
            }

            BroadcastRoundEnd(survivor);
        }

        private void EndGame()
        {
            _inGame = false;
            var ranked = _scores.Values.OrderByDescending(s => s.totalScore).ToList();

            for (var i = 0; i < ranked.Count; i++)
            {
                ranked[i].rank = i + 1;
            }

            BroadcastGameEnd(ranked);
            GetComponent<SupabaseScoreSaver>()?.SaveResults(ranked);
        }

        private void BroadcastGameEnd(List<PlayerScore> ranked)
        {
            var sb = new StringBuilder("[");
            for (var i = 0; i < ranked.Count; i++)
            {
                var s = ranked[i];
                if (i > 0) sb.Append(',');
                sb.Append($"{{\"player_id\":\"{s.playerId}\",\"nickname\":\"{s.nickname}\",");
                sb.Append($"\"total_score\":{s.totalScore},\"rank\":{s.rank}}}");
            }
            sb.Append(']');

            Network.NetworkManager.Instance?.SendRaw(
                $"{{\"event\":\"GAME_END\",\"payload\":{{\"room_code\":\"\",\"final_scores\":{sb}}}}}");
        }

        private void BroadcastGameState()
        {
            var json = $"{{\"event\":\"GAME_STATE\",\"payload\":{{\"room_code\":\"\",\"status\":\"IN_GAME\",\"round\":{_currentRound},\"package_holder_id\":\"{_packageHolderId}\",\"timer_seconds\":{_packageTimer:F1}}}}}";
            Network.NetworkManager.Instance?.SendRaw(json);
        }

        private void BroadcastRoundEnd(string survivorId)
        {
            var scoresJson = BuildScoresJson(survivorId);
            Network.NetworkManager.Instance?.SendRaw(
                $"{{\"event\":\"ROUND_END\",\"payload\":{{\"room_code\":\"\",\"round\":{_currentRound},\"scores\":{scoresJson}}}}}");
        }

        private string BuildScoresJson(string survivorId = null)
        {
            var sb = new StringBuilder("[");
            var first = true;
            foreach (var kv in _scores)
            {
                if (!first) sb.Append(',');
                first = false;
                var survived = kv.Key == survivorId;
                sb.Append($"{{\"player_id\":\"{kv.Key}\",\"round_score\":{kv.Value.roundScore},");
                sb.Append($"\"total_score\":{kv.Value.totalScore},\"survived\":{(survived ? "true" : "false")},");
                sb.Append($"\"had_explosion\":{(kv.Value.hadExplosion ? "true" : "false")}}}");
            }
            sb.Append(']');
            return sb.ToString();
        }

        [System.Serializable]
        private class PassWrapper
        {
            public PassPayload payload;
        }

        [System.Serializable]
        private class PassPayload
        {
            public string player_id;
            public string target_player_id;
        }

        public class PlayerScore
        {
            public string playerId;
            public string nickname;
            public int roundScore;
            public int totalScore;
            public int rank;
            public float timeWithoutPackage;
            public bool hadExplosion;
            public int bombsExploded;
            public int abilitiesReceived;
        }
    }
}
