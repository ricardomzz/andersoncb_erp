using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;
using System.Xml;
using SMS.Broker.DataContracts.Documents;

[DataContract]
class Payload
{
    [DataMember(Name = "mode")] public string Mode { get; set; }
    [DataMember(Name = "dis")] public DisState Dis { get; set; }
    [DataMember(Name = "documents")] public List<DocumentContext> Documents { get; set; }
}

[DataContract]
class DisState
{
    [DataMember(Name = "id")] public long Id { get; set; }
    [DataMember(Name = "number")] public long Number { get; set; }
    [DataMember(Name = "entity_guid")] public string EntityGuid { get; set; }
    [DataMember(Name = "row_version_base64")] public string RowVersionBase64 { get; set; }
    [DataMember(Name = "client_ref")] public string ClientRef { get; set; }
    [DataMember(Name = "comment")] public string Comment { get; set; }
    [DataMember(Name = "references")] public string References { get; set; }
    [DataMember(Name = "message_type")] public string MessageType { get; set; }
}

[DataContract]
class DocumentContext
{
    [DataMember(Name = "document_id")] public string DocumentId { get; set; }
}

class Program
{
    static int Main(string[] args)
    {
        if (args.Length < 2)
        {
            Console.Error.WriteLine("Usage: DISPackageSerializer <input.json> <output.xml> [envelope.xml]");
            return 2;
        }

        try
        {
            var payload = ReadJson<Payload>(args[0]);
            if (payload == null || string.IsNullOrWhiteSpace(payload.Mode))
                throw new InvalidOperationException("Input payload is missing mode.");

            var dis = BuildBaseDis(payload.Dis ?? new DisState());

            if (string.Equals(payload.Mode, "package", StringComparison.OrdinalIgnoreCase))
            {
                if (args.Length < 3)
                    throw new InvalidOperationException("Package mode requires an envelope xml path.");
                dis.Documents = BuildDisDocumentRows(payload.Documents);
                dis.Envelope = Encoding.UTF8.GetBytes(File.ReadAllText(args[2]));
            }
            else if (string.Equals(payload.Mode, "draft", StringComparison.OrdinalIgnoreCase))
            {
                // base draft only
            }
            else
            {
                throw new InvalidOperationException("Unsupported serializer mode: " + payload.Mode);
            }

            WriteDis(args[1], dis);
            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine(ex.ToString());
            return 1;
        }
    }

    static DIS BuildBaseDis(DisState state)
    {
        var dis = new DIS();
        dis.CreateCollections();
        dis.Id = state.Id;
        dis.Number = state.Number;
        dis.EntityGuid = state.EntityGuid;
        dis.ClientRef = state.ClientRef;
        dis.Comment = state.Comment;
        dis.References = state.References;
        dis.MessageType = state.MessageType;
        if (!string.IsNullOrWhiteSpace(state.RowVersionBase64))
            dis.RowVersion = Convert.FromBase64String(state.RowVersionBase64);
        return dis;
    }

    static List<DISDocumentData> BuildDisDocumentRows(List<DocumentContext> docs)
    {
        docs = docs ?? new List<DocumentContext>();
        return docs.Select((doc, index) => new DISDocumentData
        {
            Line = index + 1,
            DocumentID = doc.DocumentId,
        }).ToList();
    }

    static T ReadJson<T>(string path)
    {
        var serializer = new DataContractJsonSerializer(typeof(T));
        using (var stream = File.OpenRead(path))
            return (T)serializer.ReadObject(stream);
    }

    static void WriteDis(string path, DIS dis)
    {
        var settings = new XmlWriterSettings { Indent = true, OmitXmlDeclaration = true, Encoding = new UTF8Encoding(false) };
        var serializer = new DataContractSerializer(typeof(DIS), "entity", "http://tempuri.org/");
        using (var sw = new StringWriter())
        using (var writer = XmlWriter.Create(sw, settings))
        {
            serializer.WriteObject(writer, dis);
            writer.Flush();
            File.WriteAllText(path, sw.ToString());
        }
    }
}
