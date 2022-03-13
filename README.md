# cossacks_art

##### Desription
Cossacks Artillery :)
Use only with VPN!!!

##### install:
1. clone repo: git clone git@github.com:bikkuri/cossacks_art.git
2. install dependencies: npm install

##### Parameters:
* --streams, -s [Number] : Number of attacks on one target (default: 50)
* --time, -t [Number] : Time work limit in milliseconds (default: unlimited)
* --targets, -g [Boolean] : Use global targets url from public sources (default: true)
* --customtargets -c [Boolean] : Use custom targets from file "./targets/targets.js" (default: true)
* --timeout -0 [Number] : Time limit to waiting response (default: 3000)

##### Examples:
Default configuration. Will be parsed public targets and used custom users's targets from targets file:  
`npm start`

Use only public targets:  
`node run startPublic`

Use only custom targets from file:  
`node startCustom`

Example to use with rest of parameters:
`npm start -- --streams 100 --time 10000`