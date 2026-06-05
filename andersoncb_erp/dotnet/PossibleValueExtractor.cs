using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Text;

class Program
{
    static int Main(string[] args)
    {
        if (args.Length != 1 || string.IsNullOrWhiteSpace(args[0]))
        {
            Console.Error.WriteLine("Usage: PossibleValueExtractor <typeName.propertyName[;typeName.propertyName...]>");
            return 2;
        }

        try
        {
            LoadVendorAssembly();
            var pairs = args[0].Split(new[] { ';' }, StringSplitOptions.RemoveEmptyEntries);
            var payload = new Dictionary<string, object>();

            foreach (var pair in pairs)
            {
                var trimmed = pair.Trim();
                var pivot = trimmed.LastIndexOf('.');
                if (pivot <= 0 || pivot >= trimmed.Length - 1)
                {
                    throw new InvalidOperationException($"Invalid type/property pair: {trimmed}");
                }

                var typeName = trimmed.Substring(0, pivot);
                var propertyName = trimmed.Substring(pivot + 1);

                var type = FindType(typeName);
                if (type == null)
                {
                    throw new InvalidOperationException($"Type not found: {typeName}");
                }

                var property = type.GetProperty(propertyName, BindingFlags.Public | BindingFlags.Static);
                if (property == null)
                {
                    throw new InvalidOperationException($"Static property not found: {trimmed}");
                }

                var value = property.GetValue(null, null);
                var items = new List<Dictionary<string, object>>();
                if (value is IEnumerable enumerable)
                {
                    foreach (var item in enumerable)
                    {
                        items.Add(SerializeObject(item));
                    }
                }

                payload[trimmed] = items;
            }

            Console.WriteLine(ToJson(payload));
            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine(ex.ToString());
            return 1;
        }
    }

    static Type FindType(string typeName)
    {
        var type = Type.GetType(typeName, false);
        if (type != null)
        {
            return type;
        }

        foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
        {
            type = assembly.GetType(typeName, false);
            if (type != null)
            {
                return type;
            }
        }

        return null;
    }

    static void LoadVendorAssembly()
    {
        var candidates = new List<string>();
        candidates.Add(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "SMS.Broker.Standard.dll"));
        candidates.Add(Path.Combine(Environment.CurrentDirectory, "SMS.Broker.Standard.dll"));

        var monoPath = Environment.GetEnvironmentVariable("MONO_PATH");
        if (!string.IsNullOrWhiteSpace(monoPath))
        {
            foreach (var part in monoPath.Split(Path.PathSeparator))
            {
                if (!string.IsNullOrWhiteSpace(part))
                {
                    candidates.Add(Path.Combine(part.Trim(), "SMS.Broker.Standard.dll"));
                }
            }
        }

        foreach (var dllPath in candidates)
        {
            if (File.Exists(dllPath))
            {
                Assembly.LoadFrom(dllPath);
                return;
            }
        }
    }

    static Dictionary<string, object> SerializeObject(object item)
    {
        var values = new Dictionary<string, object>();
        if (item == null)
        {
            return values;
        }

        foreach (var property in item.GetType().GetProperties(BindingFlags.Public | BindingFlags.Instance))
        {
            if (!property.CanRead || property.GetIndexParameters().Length > 0)
            {
                continue;
            }

            values[property.Name] = property.GetValue(item, null);
        }

        return values;
    }

    static string ToJson(object value)
    {
        if (value == null)
        {
            return "null";
        }

        if (value is string s)
        {
            return "\"" + Escape(s) + "\"";
        }

        if (value is bool b)
        {
            return b ? "true" : "false";
        }

        if (value is IDictionary dictionary)
        {
            var parts = new List<string>();
            foreach (DictionaryEntry entry in dictionary)
            {
                parts.Add(ToJson(entry.Key.ToString()) + ":" + ToJson(entry.Value));
            }
            return "{" + string.Join(",", parts) + "}";
        }

        if (value is IEnumerable enumerable && !(value is string))
        {
            var parts = new List<string>();
            foreach (var item in enumerable)
            {
                parts.Add(ToJson(item));
            }
            return "[" + string.Join(",", parts) + "]";
        }

        if (value is IFormattable)
        {
            return Convert.ToString(value, System.Globalization.CultureInfo.InvariantCulture);
        }

        return "\"" + Escape(value.ToString()) + "\"";
    }

    static string Escape(string value)
    {
        var builder = new StringBuilder();
        foreach (var c in value)
        {
            switch (c)
            {
                case '\\':
                    builder.Append("\\\\");
                    break;
                case '"':
                    builder.Append("\\\"");
                    break;
                case '\b':
                    builder.Append("\\b");
                    break;
                case '\f':
                    builder.Append("\\f");
                    break;
                case '\n':
                    builder.Append("\\n");
                    break;
                case '\r':
                    builder.Append("\\r");
                    break;
                case '\t':
                    builder.Append("\\t");
                    break;
                default:
                    if (char.IsControl(c))
                    {
                        builder.Append("\\u");
                        builder.Append(((int)c).ToString("x4"));
                    }
                    else
                    {
                        builder.Append(c);
                    }
                    break;
            }
        }
        return builder.ToString();
    }
}
