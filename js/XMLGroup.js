
/*
 * Class holds group info parsed from xml definition
 *
 * To turn to JSON:
 *      JSON.stringify(instance)
 * To create from JSON:
 *      Object.setPrototypeOf(JSON.parse(string), XMLGroup.prototype)
 *
 * Cayley diagrams are returned as {name, arrows, points} where
 *      arrows are element numbers
 *      points are [x,y,z] arrays
 *
 * Symmetry objects are returned as {name, operations, spheres, paths} where
 *      operations are {element, degrees, point}
 *      spheres are {radius, color, point}
 *      paths are {color, points}
 *      point(s) are [x,y,z] arrays
 */

class XMLGroup extends BasicGroup {
   constructor (text) {
      if (text === undefined) {
         super();
         return;
      }

      let $xml;
      if (typeof(text) == 'string') {
         // Replacing named entities with values ensure that later fragment parsing succeeds...
         const cleanText = text.replace(/&Zopf;/g, "&#8484;")
                               .replace(/&times;/g, "&#215;")
                               .replace(/&ltimes;/g, "&#8905;")
                               .replace(/&rtimes;/g, "&#8906;")
                               .replace(/<br.>/g, "&lt;br/&gt;");  // hack to read fgb notes
         $xml = $($.parseXML(cleanText));
      } else {
         $xml = $(text);
      }

      super(XMLGroup._multtable_from_xml($xml));

      this.$xml = $xml;
      this.name = $xml.find('name').first().html();
      this.gapname = $xml.find('gapname').first().html();
      this.gapid = $xml.find('gapid').first().html();
      this.shortName = $xml.find('name').first().attr('text');
      this.definition = $xml.find('definition').first().html();
      this.phrase = $xml.find('phrase').text();
      this.notes = $xml.find('notes').text();
      this.author = $xml.find('author').text();
      this._XML_generators = XMLGroup._generators_from_xml($xml);
      this.reps = XMLGroup._reps_from_xml($xml);
      this.representations = XMLGroup._representations_from_xml($xml);
      this.userRepresentations = [];
      /*
       * representations and userRepresentations are treated together as a contiguous array,
       *   and representationIndex is the index of the default representation into that virtual array
       *   (representationIndex is an integer and not an object reference so XMLGroup can be easily serialized)
       */
      this.representationIndex = 0;
      this.cayleyDiagrams = XMLGroup._cayley_diagrams_from_xml($xml);
      this.symmetryObjects = XMLGroup._symmetry_objects_from_xml($xml);
   }

   static parseJSON(jsonObject) {
      const defaultValues = [
         {name: 'name', value: '<mrow><mtext>Untitled Group</mtext></mrow>'},
         {name: 'shortName', value: 'Untitled Group'},
         {name: 'author', value: ''},
         {name: 'notes', value: ''},
         {name: 'phrase', value: ''},
         {name: 'representationIndex', value: 0},
         {name: 'cayleyDiagrams', value: []},
         {name: 'symmetryObjects', value: []},
      ];
      const group = BasicGroup.parseJSON(jsonObject, Object.assign(new XMLGroup, jsonObject));
      for (const {name, value} of defaultValues) {
         group[name] = (group[name] === undefined) ? value : group[name];
      }
      if ( group.representations === undefined ) {
         group.representations = [ [ ] ];
         for ( var i = 0 ; i < group.multtable.length ; i++ )
            group.representations[0].push( `<mn>${i}</mn>` );
      }
      return group;
   }

   toJSON () {
      return {
         name : this.name,
         shortName : this.shortName,
         author : this.author,
         notes : this.notes,
         phrase : this.phrase,
         representations : this.representations,
         representationIndex : this.representationIndex,
         cayleyDiagrams : this.cayleyDiagrams,
         symmetryObjects : this.symmetryObjects,
         multtable : this.multtable
      };
   }

   deleteUserRepresentation(userIndex) {
      const savedRepresentation =
         (userIndex + this.representations.length == this.representationIndex) ? this.representations[0] : this.representation;
      this.userRepresentations.splice(userIndex, 1);
      this.representation = savedRepresentation;
   }

   get representation() {
      if (this.representationIndex < this.representations.length) {
         return this.representations[this.representationIndex];
      } else if (this.representationIndex - this.representations.length < this.userRepresentations.length) {
         return this.userRepresentations[this.representationIndex - this.representations.length];
      } else {
         return this.representations[0];
      }
   }

   set representation(representation) {
      let inx = this.representations.findIndex( (el) => el == representation );
      if (inx >= 0) {
         this.representationIndex = inx;
      } else {
         inx = this.userRepresentations.findIndex( (el) => el == representation );
         if (inx >= 0) {
            this.representationIndex = inx + this.representations.length;
         }
      }
   }

   get rep() {
      return (this.representationIndex < this.representations.length) ? this.reps[this.representationIndex] : this.representation;
   }

   get labels() {
      if (this.representationIndex > this.representations.length) {
         return this.representation.map( (rep) => mathml2text(rep) );
      } else {
         if (this._labels === undefined) {
            this._labels = Array(this.representations.length)
         }
         if (this._labels[this.representationIndex] === undefined) {
            this._labels[this.representationIndex] = this.representation.map( (rep) => mathml2text(rep) );
         }
         return this._labels[this.representationIndex];
      }
   }

   get longestLabel() {
      return this.labels.reduce( (longest, label) => (label.length > longest.length) ? label : longest, '' );
   }

   get generators() {
      const calculatedGenerators = super.generators;
      if (this._XML_generators === undefined) {
         return calculatedGenerators;
      } else if (calculatedGenerators[0].length < this._XML_generators[0].length) {
         calculatedGenerators.push(...this._XML_generators);
         return calculatedGenerators;
      } else {
         return this._XML_generators;
      }
   }

   // returns short representations as array of arrays of strings (just debugging)
   static _reps_from_xml($xml) {
      return $xml.find('representation')
                 .map(function () { return this })
                 .toArray()
                 .map(function (el) {
                    return $(el).find('element')
                                .map(function () {
                                   return $(this).attr('text')
                                })
                                .toArray()
                 });
   }

   // returns representations as array of arrays of innerHTML elements
   static _representations_from_xml($xml) {
      return $xml.find('representation')
                 .map(function () { return this })
                 .toArray()
                 .map(function (el) {
                    return $(el).find('element')
                                .map(function () {
                                   return this.innerHTML
                                })
                                .toArray()
                 });
   }

   // returns <multtable> in [[],[]] format
   static _multtable_from_xml($xml) {
      return $xml.find('multtable > row')
                 .map(function (_, el) {
                    return [el
                       .textContent
                       .split(' ')
                       .filter(function (elm) { return elm.length != 0 })
                       .map(function (elm) { return parseInt(elm) })
                    ]
                 })
                 .toArray();
   }

   // returns generators specified in XML, not those derived in subgroup computation
   static _generators_from_xml($xml) {
      const result = $xml.find('generators')
                         .map(function () {
                            return [
                               this.attributes[0].value.split(' ')
                                   .map(function (el) { return parseInt(el) }) ]
                         })
                         .toArray();
      return result.length == 0 ? undefined : result;
   }

   // {name, arrows, points}
   // arrows are element numbers
   // points are [x,y,z] arrays
   static _cayley_diagrams_from_xml($xml) {
      let cayleyDiagrams = [];
      $xml.find('cayleydiagram').each(
         (_, cd) => {
            let name, arrows = [], points = [];
            name = $(cd).find('name').text();
            $(cd).find('arrow').each( (_, ar) => { arrows.push(ar.textContent) } );
            $(cd).find('point').each( (_, pt) => {
               let x = Number(pt.getAttribute('x')),
                   y = Number(pt.getAttribute('y')),
                   z = Number(pt.getAttribute('z'));
               points.push([x,y,z]);
            } );
            cayleyDiagrams.push({name: name, arrows: arrows, points: points});
         }
      )
      return cayleyDiagrams;
   }

   static _symmetry_objects_from_xml($xml) {
      let getPoint = function(pt) {
         return [Number(pt.getAttribute('x')), Number(pt.getAttribute('y')), Number(pt.getAttribute('z'))];
      };
      let symmetryObjects = [];
      $xml.find('symmetryobject').each(
         (_, so) => {
            let name = so.getAttribute('name'),
                operations = [],
                spheres = [],
                paths = [];
            $(so).find('operation').each(
               (_, op) => {
                  let element = op.getAttribute('element'),
                      degrees = op.getAttribute('degrees'),
                      point = getPoint(op.children[0]);
                  operations.push({element: element, degrees: degrees, point: point});
               }
            );
            $(so).find('sphere').each(
               (_, sp) => {
                  let radius = Number(sp.getAttribute('radius')),
                      color = sp.getAttribute('color'),
                      point = getPoint(sp.children[0]);
                  spheres.push({radius: radius, color: color, point: point});
               }
            );
            $(so).find('path').each(
               (_, pa) => {
                  let color = pa.getAttribute('color'),
                      points = [];
                  $(pa).find('point').each(
                     (_, pt) => {
                        points.push(getPoint(pt));
                     }
                  );
                  paths.push({color: color, points: points});
               }
            );
            symmetryObjects.push(
               {name: name, operations: operations, spheres: spheres, paths: paths}
            )
         }
      )
      return symmetryObjects;
   }
}
