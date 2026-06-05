using System;
using System.IO;
using System.Runtime.Serialization;
using System.Text;
using System.Xml;
using SMS.Broker.DataContracts.Documents;

class Program
{
    static int Main(string[] args)
    {
        if (args.Length < 5)
        {
            Console.Error.WriteLine("Usage: CustomsEntrySerializer <input> <output> <number> <entryNumber> <brokerReference> [bondType] [consolidatedReleaseEntries]");
            return 2;
        }

        var xml = File.ReadAllText(args[0]);
        var document = new XmlDocument();
        document.LoadXml(xml);
        var root = document.DocumentElement;
        if (root == null)
        {
            Console.Error.WriteLine("Input XML does not have a root element.");
            return 3;
        }

        var readSerializer = new DataContractSerializer(typeof(CustomsEntry), root.LocalName, root.NamespaceURI);
        CustomsEntry entry;
        using (var sr = new StringReader(xml))
        using (var xr = XmlReader.Create(sr))
        {
            entry = (CustomsEntry)readSerializer.ReadObject(xr);
        }

        entry.Number = long.Parse(args[2]);
        entry.EntryNumber = args[3];
        entry.BrokerReferenceNumber = args[4];

        if (args.Length > 5)
            entry.BondType = args[5];

        if (args.Length > 6)
            entry.ConsolidatedReleaseEntries = args[6] == "__NULL__" ? null : args[6];

        if (entry.ConsolidatedReleaseEntries == null)
            entry.ConsolidatedReleaseEntries = "";

        var writeSettings = new XmlWriterSettings
        {
            Indent = true,
            OmitXmlDeclaration = true,
            Encoding = new UTF8Encoding(false),
        };

        var writeSerializer = new DataContractSerializer(typeof(CustomsEntry), "entity", "http://tempuri.org/");
        using (var sw = new StringWriter())
        using (var xw = XmlWriter.Create(sw, writeSettings))
        {
            writeSerializer.WriteObject(xw, entry);
            xw.Flush();
            File.WriteAllText(args[1], sw.ToString());
        }

        return 0;
    }
}
