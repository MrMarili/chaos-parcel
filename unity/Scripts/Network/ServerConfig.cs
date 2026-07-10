using UnityEngine;

namespace ChaosParcel.Network
{
    /// <summary>
    /// Supabase credentials for Host only. Create via Assets > Create > Chaos Parcel > Server Config.
    /// Add ServerConfig.asset to .gitignore — never commit service keys.
    /// </summary>
    [CreateAssetMenu(fileName = "ServerConfig", menuName = "Chaos Parcel/Server Config")]
    public class ServerConfig : ScriptableObject
    {
        [SerializeField] private string supabaseUrl = "";
        [SerializeField] private string supabaseServiceKey = "";

        public string SupabaseUrl => supabaseUrl;
        public string SupabaseServiceKey => supabaseServiceKey;
    }
}
